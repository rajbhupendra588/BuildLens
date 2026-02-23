from fastapi import APIRouter, Query, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
import uuid
import json

from app.core.database import get_session
from app.models.chat import ChatSession, ChatMessage
from app.services.retrieval_service import retrieval_service
from app.services.llm_service import llm_service
from app.services.chat_history_service import chat_history_service

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
    return {"session_id": new_session.id, "title": new_session.title}

@router.get("/sessions")
async def list_sessions(db: Session = Depends(get_session)):
    statement = select(ChatSession).order_by(ChatSession.created_at.desc())
    sessions = db.exec(statement).all()
    return sessions


@router.get("/ask-stream")
async def ask_question_stream(
    question: str = Query(...), 
    session_id: uuid.UUID = Query(...),
    db: Session = Depends(get_session)
):
    chat_history_service.add_message(db, session_id, "user", question)

    history = chat_history_service.get_history(db, session_id, limit=10)

    context_chunks = await retrieval_service.search(question, limit=5)

    if not context_chunks:
        async def no_context_gen():
            yield "Sorry, I couldn't find any relevant information."
        return StreamingResponse(no_context_gen(), media_type="text/plain")

    async def generate_with_history_tracking():
        full_ai_response = ""
        async for chunk_raw in llm_service.generate_answer_stream(question, context_chunks, history):
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
            print(f"DEBUG: Saving assistant response: {full_ai_response[:50]}...")
            chat_history_service.add_message(db, session_id, "assistant", full_ai_response)
        else:
            print("DEBUG: Warning - full_ai_response is empty!")
            
    return StreamingResponse(
        generate_with_history_tracking(),
        media_type="text/event-stream"
    )