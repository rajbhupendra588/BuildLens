import re
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
from app.services.vector_service import vector_service
from app.services.llm_service import llm_service
from app.services.chat_history_service import chat_history_service
from app.services.intent_service import IntentMode, intent_classifier
from app.services.slash_command_service import parse_slash_command
from app.services.settings_service import settings_service
from app.services.media_resolver import build_media_attachments, is_image_filename
from app.services.document_storage_service import document_storage
from app.services.session_attachment_service import (
    attach_library_document,
    build_session_context_chunks,
    detach_from_session,
    list_for_session,
    merge_with_vector_results,
    resolve_index_status,
    set_index_status,
)

router = APIRouter(prefix="/chat", tags=["Chat"])

# Skip vector search for short conversational messages (faster replies, fewer irrelevant sources).
_CONVERSATIONAL_QUERY = re.compile(
    r"^(hi|hello|hey|thanks|thank you|good morning|good evening|bye|ok|okay)[!.?\s]*$",
    re.I,
)

@router.post("/ask")
async def ask_question(question: str):
    if retrieval_service.is_knowledge_base_inventory_query(question):
        docs = await retrieval_service.list_indexed_documents()
        stats = vector_service.get_stats()
        context_chunks = retrieval_service.build_inventory_context_chunks(
            docs, stats["total_chunks"]
        )
    else:
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

class AttachLibraryDocumentPayload(BaseModel):
    document_id: str


@router.post("/sessions/{session_id}/attachments")
async def attach_library_document_to_session(
    session_id: uuid.UUID,
    payload: AttachLibraryDocumentPayload,
    db: Session = Depends(get_session),
):
    """Link an indexed library file to a conversation (e.g. open chat from Library)."""
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    document_id = payload.document_id.strip()
    if not document_id:
        raise HTTPException(status_code=400, detail="document_id is required")

    docs = await retrieval_service.list_indexed_documents()
    doc_meta = next((d for d in docs if d["document_id"] == document_id), None)
    path = document_storage.find_path(document_id)
    if not doc_meta and not path:
        raise HTTPException(status_code=404, detail="Document not found in library")

    file_name = (
        doc_meta["file_name"]
        if doc_meta
        else (path.name if path else "unknown")
    )

    try:
        row = attach_library_document(
            session_id,
            document_id,
            file_name,
            indexed_in_library=doc_meta is not None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "id": str(row.id),
        "document_id": row.document_id,
        "file_name": row.file_name,
        "index_status": row.index_status,
        "preview_chars": len(row.quick_text or ""),
        "created_at": row.created_at.isoformat(),
    }


@router.get("/sessions/{session_id}/attachments")
async def list_session_attachments(
    session_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    rows = list_for_session(session_id)
    indexed_docs = await retrieval_service.list_indexed_documents()
    indexed_ids = {d["document_id"] for d in indexed_docs if d.get("document_id")}

    payload: list[dict] = []
    for r in rows:
        status = resolve_index_status(r, indexed_ids)
        if status == "indexed" and r.index_status != "indexed":
            set_index_status(r.document_id, "indexed")
        chat_ready = status in ("indexed", "quick_ready")
        payload.append(
            {
                "id": str(r.id),
                "document_id": r.document_id,
                "file_name": r.file_name,
                "index_status": status,
                "chat_ready": chat_ready,
                "preview_chars": len(r.quick_text or ""),
                "created_at": r.created_at.isoformat(),
            }
        )
    return payload


@router.delete("/sessions/{session_id}/attachments/{attachment_id}")
async def remove_session_attachment(
    session_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not detach_from_session(session_id, attachment_id):
        raise HTTPException(status_code=404, detail="Attachment not found")
    return {"message": "Attachment removed from conversation"}


@router.post("/sessions/{session_id}/messages/{message_id}/rollback")
async def rollback_from_message(
    session_id: uuid.UUID,
    message_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Remove this message and every message after it in the conversation."""
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    deleted = chat_history_service.rollback_from_message(db, session_id, message_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"deleted": deleted}


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
            "media": m.media or [],
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
    top_k: Optional[int] = Query(None),
    score_threshold: Optional[float] = Query(None),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_session)
):
    user_row = chat_history_service.add_message(
        db, session_id, "user", question, provider, model
    )

    slash = parse_slash_command(question)
    retrieval_query = slash.retrieval_query
    llm_user_message = slash.llm_user_message

    # Read RAG params from DB if not supplied by the caller
    if top_k is None:
        top_k = int(settings_service.get("rag_top_k", db) or 5)
    if score_threshold is None:
        score_threshold = float(settings_service.get("rag_score_threshold", db) or 0.3)

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
        title_seed = question
        if slash.command == "briefingdoc":
            title_seed = "Briefing document"
        elif slash.command == "studyguide":
            title_seed = "Study guide"
        elif slash.command == "infographic":
            title_seed = "Infographic summary"
        background_tasks.add_task(
            update_session_title_logic,
            db,
            session_id,
            title_seed,
            provider,
            model,
            api_key,
        )

    indexed_docs = await retrieval_service.list_indexed_documents()
    session_attachments = list_for_session(session_id)
    scoped_document_ids = (
        [a.document_id for a in session_attachments]
        if session_attachments
        else None
    )

    search_pool: list[dict] = list(indexed_docs)
    if scoped_document_ids:
        scoped_set = set(scoped_document_ids)
        search_pool = [
            d for d in search_pool if d.get("document_id") in scoped_set
        ]
        known = {d.get("document_id") for d in search_pool}
        for att in session_attachments:
            if att.document_id not in known:
                search_pool.append(
                    {
                        "document_id": att.document_id,
                        "file_name": att.file_name,
                    }
                )

    target_document_ids = retrieval_service.resolve_query_to_documents(
        retrieval_query, search_pool
    )
    if (
        not target_document_ids
        and scoped_document_ids
        and len(scoped_document_ids) == 1
    ):
        target_document_ids = scoped_document_ids

    search_document_ids = target_document_ids or scoped_document_ids
    session_context_filter = target_document_ids or scoped_document_ids
    session_context = build_session_context_chunks(
        session_id, document_ids=session_context_filter
    )

    search_limit = top_k
    if slash.forced_mode in (
        IntentMode.BRIEFING_DOC,
        IntentMode.STUDY_GUIDE,
        IntentMode.INFOGRAPHIC,
    ):
        search_limit = max(top_k, 12)
    if target_document_ids and len(target_document_ids) == 1:
        search_limit = max(search_limit, 8)

    docs_for_media = search_pool if scoped_document_ids else indexed_docs

    if _CONVERSATIONAL_QUERY.match(question.strip()):
        vector_chunks = []
    elif retrieval_service.is_knowledge_base_inventory_query(retrieval_query):
        inventory_docs = search_pool if scoped_document_ids else indexed_docs
        if scoped_document_ids or not search_document_ids:
            stats = vector_service.get_stats()
            vector_chunks = retrieval_service.build_inventory_context_chunks(
                inventory_docs, stats["total_chunks"]
            )
            if scoped_document_ids and vector_chunks:
                vector_chunks[0]["content"] = vector_chunks[0]["content"].replace(
                    "Knowledge base inventory",
                    "Files attached to this conversation",
                    1,
                )
        else:
            vector_chunks = await retrieval_service.search(
                retrieval_query,
                limit=search_limit,
                min_score=score_threshold,
                document_ids=search_document_ids,
            )
    else:
        vector_chunks = await retrieval_service.search(
            retrieval_query,
            limit=search_limit,
            min_score=score_threshold,
            document_ids=search_document_ids,
        )

    context_chunks = merge_with_vector_results(
        session_context, vector_chunks, limit=search_limit
    )
    context_chunks = retrieval_service.rerank_chunks_by_filename(
        retrieval_query, context_chunks
    )

    if scoped_document_ids:
        attached_names = [
            d.get("file_name")
            for d in search_pool
            if d.get("file_name")
        ]
        if not attached_names:
            attached_names = [a.file_name for a in session_attachments]
        if attached_names:
            focus_line = (
                "Answer only from files attached to this conversation: "
                + ", ".join(attached_names)
                + ". Do not use content from any other library files."
            )
            if target_document_ids:
                focus_names = [
                    d["file_name"]
                    for d in search_pool
                    if d.get("document_id") in target_document_ids
                    and d.get("file_name")
                ]
                if focus_names:
                    focus_line += (
                        " The user's question especially concerns: "
                        + ", ".join(focus_names)
                        + "."
                    )
            context_chunks.insert(
                0,
                {
                    "content": focus_line,
                    "score": 2.0,
                    "metadata": {
                        "file_name": attached_names[0],
                        "element_type": "routing_hint",
                    },
                },
            )
    media_attachments = build_media_attachments(
        retrieval_query, context_chunks, docs_for_media
    )

    # Build serialisable source cards from retrieved chunks
    source_cards = [
        {
            "document_id": c["metadata"].get("document_id"),
            "file_name": c["metadata"].get("file_name", "Unknown"),
            "score": round(c["score"], 3),
            "snippet": (c["content"] or "")[:200],
            "page_number": c["metadata"].get("page_number"),
            "section_title": c["metadata"].get("section_title"),
            "language": c["metadata"].get("language"),
            "element_type": c["metadata"].get("element_type"),
            "is_image": is_image_filename(c["metadata"].get("file_name", "")),
        }
        for c in context_chunks
    ]

    # Classify intent using source metadata signals + query patterns (zero I/O)
    source_metadata = [c["metadata"] for c in context_chunks]
    intent = intent_classifier.classify(retrieval_query, source_metadata)
    if slash.forced_mode is not None:
        intent = intent_classifier.result_for_mode(
            slash.forced_mode,
            has_context=len(source_metadata) > 0,
            confidence=1.0,
            signals=[f"slash_command:/{slash.command}"],
        )

    async def generate_with_history_tracking():
        yield f"data: {json.dumps({'type': 'user_message', 'id': str(user_row.id), 'created_at': user_row.created_at.isoformat()})}\n\n"

        # Emit sources as first event so the client can render cards immediately
        yield f"data: {json.dumps({'type': 'sources', 'sources': source_cards})}\n\n"

        if media_attachments:
            yield f"data: {json.dumps({'type': 'media', 'media': media_attachments})}\n\n"

        # Emit intent event — consumed by frontend to render mode badge
        yield f"data: {json.dumps({'type': 'intent', 'mode': intent.mode.value, 'label': intent.label, 'icon': intent.icon})}\n\n"

        full_ai_response = ""
        async for chunk_raw in llm_service.generate_answer_stream(
            llm_user_message, context_chunks, history, provider=provider, model=model,
            intent=intent, api_key=api_key,
            inline_images=bool(media_attachments),
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
                assistant_row = chat_history_service.add_message(
                    db, session_id, "assistant", full_ai_response, provider, model,
                    sources=source_cards,
                    media=media_attachments or None,
                    detected_mode=intent.mode.value,
                )
                yield f"data: {json.dumps({'type': 'assistant_saved', 'id': str(assistant_row.id), 'created_at': assistant_row.created_at.isoformat()})}\n\n"
            except Exception as e:
                print(f"Error saving assistant response: {e}")
        else:
            print("DEBUG: Warning - full_ai_response is empty!")
            err = (
                "The model returned no answer. Try a faster model "
                "(e.g. OpenRouter → Ling 3.0 Flash) or send the message again."
            )
            yield f"data: {json.dumps({'type': 'error', 'content': err})}\n\n"

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