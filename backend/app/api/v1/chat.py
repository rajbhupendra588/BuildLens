import re
from fastapi import APIRouter, Query, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import List, Optional
import uuid
import json

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.chat import ChatSession, ChatMessage
from app.models.user import User
from app.services.access_control import (
    filter_documents_for_user,
    require_chat_session,
    require_document_owned,
)
from app.services.retrieval_service import retrieval_service
from app.services.vector_service import vector_service
from app.services.llm_service import llm_service
from app.services.chat_history_service import chat_history_service
from app.services.intent_service import IntentMode, intent_classifier
from app.services.slash_command_service import parse_slash_command
from app.services.report_chat_service import report_followup_chunks, stream_report_command
from app.services.report_service import report_service
from app.services.settings_service import settings_service
from app.services.media_resolver import build_media_attachments, is_image_filename
from app.services.document_storage_service import document_storage
from app.services.document_catalog_service import document_catalog_service
from app.services.quick_extract_service import is_placeholder_preview
from app.services.source_location_service import (
    enrich_location_metadata,
    format_location_label,
)
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


async def _library_documents(db: Session, user: User) -> list[dict]:
    docs = await retrieval_service.list_indexed_documents()
    docs = filter_documents_for_user(db, user, docs)
    return document_catalog_service.enrich_documents(db, docs)


def _assign_source_indices(context_chunks: list[dict]) -> None:
    """Number evidence chunks for LLM [n] citations and UI source cards."""
    index = 0
    for chunk in context_chunks:
        meta = chunk.setdefault("metadata", {})
        enrich_location_metadata(meta, chunk.get("content") or "")
        if meta.get("element_type") in ("routing_hint", "inventory"):
            meta["source_index"] = None
            continue
        index += 1
        meta["source_index"] = index


def _source_card_from_chunk(chunk: dict) -> dict:
    meta = dict(chunk.get("metadata") or {})
    content = chunk.get("content") or ""
    enrich_location_metadata(meta, content)
    file_name = meta.get("file_name", "Unknown")
    return {
        "document_id": meta.get("document_id"),
        "chunk_id": meta.get("chunk_id") or chunk.get("chunk_id"),
        "file_name": file_name,
        "score": round(float(chunk.get("score", 0)), 3),
        "snippet": content[:200],
        "page_number": meta.get("page_number"),
        "section_title": meta.get("section_title"),
        "paragraph_index": meta.get("paragraph_index"),
        "line_start": meta.get("line_start"),
        "line_end": meta.get("line_end"),
        "location_label": format_location_label(meta),
        "source_index": meta.get("source_index"),
        "language": meta.get("language"),
        "element_type": meta.get("element_type"),
        "is_image": is_image_filename(file_name),
        "bbox": meta.get("bbox"),
        "collection": meta.get("collection"),
    }


def _attachment_matches_scope(db: Session, document_id: str, file_name: str, scope: str | None) -> bool:
    if not scope or scope == "all":
        return True
    from app.services.collection_classifier import scope_to_collection, classify_collection

    target = scope_to_collection(scope)
    if not target:
        return True
    row = document_catalog_service.get(db, document_id)
    collection = row.collection if row else classify_collection(file_name)
    return collection == target


# Skip vector search for short conversational messages (faster replies, fewer irrelevant sources).
_CONVERSATIONAL_QUERY = re.compile(
    r"^(hi|hello|hey|thanks|thank you|good morning|good evening|bye|ok|okay)[!.?\s]*$",
    re.I,
)

@router.post("/ask")
async def ask_question(
    question: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if retrieval_service.is_knowledge_base_inventory_query(question):
        docs = await _library_documents(db, current_user)
        total_chunks = sum(d.get("chunk_count", 0) for d in docs)
        context_chunks = retrieval_service.build_inventory_context_chunks(
            docs, total_chunks
        )
    else:
        context_chunks = await retrieval_service.search(
            question, limit=5, owner_user_id=current_user.id
        )

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
async def create_new_session(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    new_session = chat_history_service.create_session(db, user_id=current_user.id)
    return {"id": new_session.id, "title": new_session.title, "created_at": new_session.created_at}

@router.get("/sessions")
async def list_sessions(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    statement = (
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.is_pinned.desc(), ChatSession.updated_at.desc())
    )
    sessions = db.exec(statement).all()
    return sessions

@router.patch("/sessions/{session_id}")
async def update_session(
    session_id: uuid.UUID,
    title: Optional[str] = Query(None),
    is_pinned: Optional[bool] = Query(None),
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    session = require_chat_session(db, current_user, session_id)
    if title is not None and title.strip():
        session = chat_history_service.update_session_title(
            db, session_id, title.strip()
        )
    if is_pinned is not None:
        session = chat_history_service.set_session_pinned(db, session_id, is_pinned)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.delete("/sessions/{session_id}")
async def remove_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    require_chat_session(db, current_user, session_id)
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
    current_user: User = Depends(get_current_user),
):
    """Link an indexed library file to a conversation (e.g. open chat from Library)."""
    require_chat_session(db, current_user, session_id)

    document_id = payload.document_id.strip()
    if not document_id:
        raise HTTPException(status_code=400, detail="document_id is required")

    catalog_row = document_catalog_service.get(db, document_id)
    if catalog_row is not None:
        require_document_owned(db, current_user, document_id)

    docs = await _library_documents(db, current_user)
    doc_meta = next((d for d in docs if d["document_id"] == document_id), None)
    path = document_storage.find_path(document_id)
    if doc_meta is None:
        session_rows = list_for_session(session_id)
        on_session = any(r.document_id == document_id for r in session_rows)
        if not on_session:
            raise HTTPException(status_code=404, detail="Document not found in library")
    elif not path and not doc_meta:
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
    current_user: User = Depends(get_current_user),
):
    require_chat_session(db, current_user, session_id)
    rows = list_for_session(session_id)
    indexed_docs = await _library_documents(db, current_user)
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
    current_user: User = Depends(get_current_user),
):
    require_chat_session(db, current_user, session_id)
    if not detach_from_session(session_id, attachment_id):
        raise HTTPException(status_code=404, detail="Attachment not found")
    return {"message": "Attachment removed from conversation"}


@router.post("/sessions/{session_id}/messages/{message_id}/rollback")
async def rollback_from_message(
    session_id: uuid.UUID,
    message_id: uuid.UUID,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Remove this message and every message after it in the conversation."""
    require_chat_session(db, current_user, session_id)

    deleted = chat_history_service.rollback_from_message(db, session_id, message_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"deleted": deleted}


@router.get("/history/{session_id}")
async def get_chat_history(
    session_id: uuid.UUID,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    require_chat_session(db, current_user, session_id)

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
    document_scope: Optional[str] = Query(
        None,
        description="Library filter: all, structural, architectural, etc.",
    ),
    report_id: Optional[uuid.UUID] = Query(
        None,
        description="Optional generated report to include as follow-up context.",
    ),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    require_chat_session(db, current_user, session_id)

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
        elif slash.command == "dashboard":
            title_seed = "Visual dashboard"
        elif slash.command == "report":
            title_seed = "Document report"
        background_tasks.add_task(
            update_session_title_logic,
            db,
            session_id,
            title_seed,
            provider,
            model,
            api_key,
        )

    indexed_docs = await _library_documents(db, current_user)
    indexed_docs = document_catalog_service.filter_documents_by_scope(
        db, indexed_docs, document_scope
    )
    session_attachments = list_for_session(session_id)
    if document_scope and document_scope != "all":
        session_attachments = [
            a
            for a in session_attachments
            if _attachment_matches_scope(db, a.document_id, a.file_name, document_scope)
        ]
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

    if slash.command == "report":
        scoped_library_ids = [
            d["document_id"] for d in search_pool if d.get("document_id")
        ]
        return StreamingResponse(
            stream_report_command(
                db=db,
                current_user=current_user,
                session_id=session_id,
                user_row=user_row,
                provider=provider,
                model=model,
                api_key=api_key,
                scoped_library_ids=scoped_library_ids,
            ),
            media_type="text/event-stream",
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
    indexed_ids = {
        d["document_id"] for d in indexed_docs if d.get("document_id")
    }
    session_context = build_session_context_chunks(
        session_id,
        document_ids=session_context_filter,
        indexed_document_ids=indexed_ids,
    )
    if report_id is not None:
        try:
            report_row = report_service.get_owned(db, current_user, report_id)
            if isinstance(report_row.content, dict):
                session_context = (
                    report_followup_chunks(report_row.content) + session_context
                )
        except HTTPException:
            pass

    search_limit = top_k
    if slash.forced_mode in (
        IntentMode.BRIEFING_DOC,
        IntentMode.STUDY_GUIDE,
        IntentMode.INFOGRAPHIC,
        IntentMode.DASHBOARD,
    ):
        search_limit = max(top_k, 12)
    if target_document_ids and len(target_document_ids) == 1:
        search_limit = max(search_limit, 8)

    docs_for_media = search_pool if scoped_document_ids else indexed_docs

    scope_blocks_rag = (
        document_scope
        and document_scope != "all"
        and not _CONVERSATIONAL_QUERY.match(question.strip())
        and not search_pool
        and not session_attachments
    )
    if scope_blocks_rag:
        scope_label = document_scope.replace("-", " ").replace("_", " ")
        err_text = (
            f"No documents in the selected scope ({scope_label}). "
            "Upload matching documents or switch scope to All Project Documents."
        )

        async def scope_empty_stream():
            yield f"data: {json.dumps({'type': 'user_message', 'id': str(user_row.id), 'created_at': user_row.created_at.isoformat()})}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'text': 'Searching project documents…'})}\n\n"
            yield f"data: {json.dumps({'type': 'sources', 'sources': []})}\n\n"
            yield f"data: {json.dumps({'type': 'error', 'content': err_text})}\n\n"
            assistant_row = chat_history_service.add_message(
                db,
                session_id,
                "assistant",
                err_text,
                provider,
                model,
                sources=[],
            )
            yield f"data: {json.dumps({'type': 'assistant_saved', 'id': str(assistant_row.id), 'created_at': assistant_row.created_at.isoformat()})}\n\n"

        return StreamingResponse(scope_empty_stream(), media_type="text/event-stream")

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
                owner_user_id=current_user.id,
            )
    else:
        vector_chunks = await retrieval_service.search(
            retrieval_query,
            limit=search_limit,
            min_score=score_threshold,
            document_ids=search_document_ids,
            owner_user_id=current_user.id,
        )

    context_chunks = merge_with_vector_results(
        session_context, vector_chunks, limit=search_limit
    )
    context_chunks = [
        c
        for c in context_chunks
        if (c.get("metadata") or {}).get("element_type")
        in ("routing_hint", "inventory")
        or not is_placeholder_preview(c.get("content"))
    ]
    context_chunks = retrieval_service.rerank_chunks_by_filename(
        retrieval_query, context_chunks
    )
    _assign_source_indices(context_chunks)

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
    doc_ids_for_cards = [
        (c.get("metadata") or {}).get("document_id")
        for c in context_chunks
        if (c.get("metadata") or {}).get("document_id")
    ]
    collection_map = document_catalog_service.collections_for_ids(
        db, doc_ids_for_cards
    )
    source_cards = []
    for chunk in context_chunks:
        meta = chunk.get("metadata") or {}
        if meta.get("element_type") in ("routing_hint", "inventory"):
            continue
        if meta.get("source_index") is None:
            continue
        card = _source_card_from_chunk(chunk)
        doc_id = card.get("document_id")
        if doc_id and doc_id in collection_map:
            card["collection"] = collection_map[doc_id]
        source_cards.append(card)

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
        stream_error = False
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
                elif data.get("type") == "error":
                    stream_error = True
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
        elif not stream_error:
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
async def export_chat(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Export all chat sessions and messages as JSON."""
    sessions = db.exec(
        select(ChatSession).where(ChatSession.user_id == current_user.id)
    ).all()
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
async def import_chat(
    sessions: List[ImportSessionPayload],
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Import chat sessions and messages from a JSON export."""
    for sess_data in sessions:
        new_session = ChatSession(
            title=sess_data.title,
            provider=sess_data.provider,
            model_name=sess_data.model_name,
            user_id=current_user.id,
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