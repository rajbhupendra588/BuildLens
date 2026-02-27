from fastapi import APIRouter, Query, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import List, Optional
import uuid
import json

from app.core.database import get_session
from app.models.chat import ChatSession, ChatMessage
from app.services.retrieval_service import retrieval_service
from app.services.llm_service import llm_service
from app.services.chat_history_service import chat_history_service
from app.services.intent_service import intent_classifier
from app.services.settings_service import settings_service

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("/ask")
async def ask_question(question: str):
    context_chunks = await retrieval_service.search(question, limit=5)

    if not context_chunks:
        return {
            "answer": "Sorry, I couldn't find any relevant information.",
            "sources": []
        }

    answer = await llm_service.generate_answer(question, context_chunks)

    return {
        "answer": answer,
        "sources": [res["metadata"].get("file_name") for res in context_chunks]
    }

@router.post("/sessions")
async def create_new_session(db: Session = Depends(get_session)):
    new_session = chat_history_service.create_session(db)
    return {"id": new_session.id, "title": new_session.title, "created_at": new_session.created_at}

@router.get("/sessions")
async def list_sessions(db: Session = Depends(get_session)):
    statement = select(ChatSession).order_by(ChatSession.created_at.desc())
    sessions = db.exec(statement).all()
    return sessions

@router.patch("/sessions/{session_id}")
async def rename_session(session_id: uuid.UUID, title: str, db: Session = Depends(get_session)):
    updated_session = chat_history_service.update_session_title(db, session_id, title)
    if not updated_session:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated_session

@router.delete("/sessions/{session_id}")
async def remove_session(session_id: uuid.UUID, db: Session = Depends(get_session)):
    success = chat_history_service.delete_session(db, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted successfully"}

@router.get("/history/{session_id}")
async def get_chat_history(
    session_id: uuid.UUID,
    db: Session = Depends(get_session)
):
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = chat_history_service.get_session_message(db, session_id)
    return [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "provider": m.provider,
            "model": m.model,
            "sources": m.sources or [],
            "detected_mode": m.detected_mode,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]

async def update_session_title_logic(
    db: Session,
    session_id: uuid.UUID,
    first_question: str,
    provider: str = "ollama",
    model: str = "",
    api_key: Optional[str] = None,
):
    session = db.get(ChatSession, session_id)

    if session and session.title in ("New Chat", "New Conversation"):
        new_title = await llm_service.generate_title(first_question, provider=provider, model=model, api_key=api_key)
        session.title = new_title
        db.add(session)
        db.commit()
        print(f"DEBUG: Session {session_id} renamed to: {new_title}")


@router.get("/ask-stream")
async def ask_question_stream(
    question: str = Query(...),
    session_id: uuid.UUID = Query(...),
    provider: str = Query("ollama"),
    model: str = Query("minimax-m2:cloud"),
    top_k: int = Query(5),
    score_threshold: float = Query(0.3),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_session)
):
    chat_history_service.add_message(db, session_id, "user", question, provider, model)

    # Read the provider's API key from DB (falls back to env var inside llm_service if None)
    _KEY_MAP = {
        "openai": "openai_api_key",
        "gemini": "gemini_api_key",
        "anthropic": "anthropic_api_key",
        "openrouter": "openrouter_api_key",
        "moonshot": "moonshot_api_key",
        "minimax": "minimax_api_key",
        "zai": "zai_api_key",
    }
    api_key = settings_service.get(_KEY_MAP[provider], db) if provider in _KEY_MAP else None

    history = chat_history_service.get_history(db, session_id, limit=10)
    if len(history) <= 1:
        background_tasks.add_task(update_session_title_logic, db, session_id, question, provider, model, api_key)

    context_chunks = await retrieval_service.search(question, limit=top_k, min_score=score_threshold)

    # Build serialisable source cards from retrieved chunks
    source_cards = [
        {
            "file_name": c["metadata"].get("file_name", "Unknown"),
            "score": round(c["score"], 3),
            "snippet": (c["content"] or "")[:200],
            "page_number": c["metadata"].get("page_number"),
            "section_title": c["metadata"].get("section_title"),
            "language": c["metadata"].get("language"),
            "element_type": c["metadata"].get("element_type"),
        }
        for c in context_chunks
    ]

    # Classify intent using source metadata signals + query patterns (zero I/O)
    source_metadata = [c["metadata"] for c in context_chunks]
    intent = intent_classifier.classify(question, source_metadata)

    async def generate_with_history_tracking():
        # Emit sources as first event so the client can render cards immediately
        yield f"data: {json.dumps({'type': 'sources', 'sources': source_cards})}\n\n"

        # Emit intent event — consumed by frontend to render mode badge
        yield f"data: {json.dumps({'type': 'intent', 'mode': intent.mode.value, 'label': intent.label, 'icon': intent.icon})}\n\n"

        full_ai_response = ""
        async for chunk_raw in llm_service.generate_answer_stream(
            question, context_chunks, history, provider=provider, model=model,
            intent=intent, api_key=api_key,
        ):
            yield chunk_raw

            try:
                clean_json = chunk_raw.replace("data: ", "").strip()
                if not clean_json:
                    continue

                data = json.loads(clean_json)
                if data.get("type") == "content":
                    text = data.get("text", "")
                    if text:
                        full_ai_response += text
            except json.JSONDecodeError as e:
                print(f"JSON Decode Error: {e} | Raw: {chunk_raw}")
                continue
            except Exception as e:
                print(f"Error: {e} | Raw: {chunk_raw}")
                continue

        if full_ai_response:
            try:
                chat_history_service.add_message(
                    db, session_id, "assistant", full_ai_response, provider, model,
                    sources=source_cards,
                    detected_mode=intent.mode.value,
                )
            except Exception as e:
                print(f"Error saving assistant response: {e}")
        else:
            print("DEBUG: Warning - full_ai_response is empty!")

    return StreamingResponse(
        generate_with_history_tracking(),
        media_type="text/event-stream"
    )


# ---------------------------------------------------------------------------
# Export / Import
# ---------------------------------------------------------------------------

@router.get("/export")
async def export_chat(db: Session = Depends(get_session)):
    """Export all chat sessions and messages as JSON."""
    sessions = db.exec(select(ChatSession)).all()
    result = []
    for session in sessions:
        msgs = db.exec(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.asc())
        ).all()
        result.append({
            "title": session.title,
            "provider": session.provider,
            "model_name": session.model_name,
            "created_at": session.created_at.isoformat(),
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "provider": m.provider,
                    "model": m.model,
                    "created_at": m.created_at.isoformat(),
                }
                for m in msgs
            ],
        })
    return result


class ImportMessagePayload(BaseModel):
    role: str
    content: str
    provider: str = "ollama"
    model: str = ""


class ImportSessionPayload(BaseModel):
    title: str = "Imported Conversation"
    provider: str = "ollama"
    model_name: str = ""
    messages: List[ImportMessagePayload] = []


@router.post("/import")
async def import_chat(sessions: List[ImportSessionPayload], db: Session = Depends(get_session)):
    """Import chat sessions and messages from a JSON export."""
    for sess_data in sessions:
        new_session = ChatSession(
            title=sess_data.title,
            provider=sess_data.provider,
            model_name=sess_data.model_name,
        )
        db.add(new_session)
        db.commit()
        db.refresh(new_session)

        for msg_data in sess_data.messages:
            new_msg = ChatMessage(
                session_id=new_session.id,
                role=msg_data.role,
                content=msg_data.content,
                provider=msg_data.provider,
                model=msg_data.model,
            )
            db.add(new_msg)
        db.commit()

    return {"message": f"Imported {len(sessions)} session(s)"}