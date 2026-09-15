from __future__ import annotations

import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.config import settings
from app.core.database import engine
from app.models.session_attachment import SessionAttachment
from app.services.quick_extract_service import (
    extract_from_document,
    is_placeholder_preview,
)


def _db() -> Session:
    return Session(engine)


def attach_to_session(
    session_id: uuid.UUID,
    document_id: str,
    file_name: str,
    quick_text: str,
    *,
    index_status: str = "quick_ready",
) -> SessionAttachment:
    with _db() as db:
        row = SessionAttachment(
            session_id=session_id,
            document_id=document_id,
            file_name=file_name,
            quick_text=quick_text,
            index_status=index_status,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row


def set_index_status(document_id: str, status: str) -> None:
    with _db() as db:
        rows = db.exec(
            select(SessionAttachment).where(
                SessionAttachment.document_id == document_id
            )
        ).all()
        for row in rows:
            row.index_status = status
            db.add(row)
        db.commit()


def on_library_index_complete(document_id: str) -> None:
    """After full vector indexing, drop OCR stub previews so RAG uses real chunks."""
    with _db() as db:
        rows = db.exec(
            select(SessionAttachment).where(
                SessionAttachment.document_id == document_id
            )
        ).all()
        for row in rows:
            row.index_status = "indexed"
            if is_placeholder_preview(row.quick_text):
                row.quick_text = None
            db.add(row)
        db.commit()


def count_for_session(session_id: uuid.UUID) -> int:
    return len(list_for_session(session_id))


def attach_library_document(
    session_id: uuid.UUID,
    document_id: str,
    file_name: str,
    *,
    indexed_in_library: bool,
) -> SessionAttachment:
    """Link an already-uploaded library file to a chat session."""
    existing = list_for_session(session_id)
    for row in existing:
        if row.document_id == document_id:
            return row

    max_attach = settings.STORAGE.MAX_SESSION_ATTACHMENTS
    if len(existing) >= max_attach:
        raise ValueError(
            f"Maximum {max_attach} files per conversation. Remove a file before adding another."
        )

    quick = extract_from_document(document_id, file_name)
    if indexed_in_library:
        index_status = "indexed"
    elif quick.text.strip():
        index_status = "quick_ready"
    else:
        index_status = "indexed"

    return attach_to_session(
        session_id,
        document_id,
        file_name,
        quick.text,
        index_status=index_status,
    )


def list_for_session(session_id: uuid.UUID) -> list[SessionAttachment]:
    with _db() as db:
        return list(
            db.exec(
                select(SessionAttachment)
                .where(SessionAttachment.session_id == session_id)
                .order_by(SessionAttachment.created_at.desc())
            ).all()
        )


def resolve_index_status(
    att: SessionAttachment,
    indexed_document_ids: set[str],
) -> str:
    """UI/API status: library index wins; quick text means chat-ready."""
    if att.document_id in indexed_document_ids:
        return "indexed"
    if att.index_status == "error":
        return "error"
    if att.index_status in ("indexed", "quick_ready"):
        return att.index_status
    if (att.quick_text or "").strip():
        return "quick_ready"
    return att.index_status or "indexing"


def detach_from_session(session_id: uuid.UUID, attachment_id: uuid.UUID) -> bool:
    """Remove a file from the conversation without deleting it from the library."""
    with _db() as db:
        row = db.get(SessionAttachment, attachment_id)
        if not row or row.session_id != session_id:
            return False
        db.delete(row)
        db.commit()
        return True


def build_session_context_chunks(
    session_id: uuid.UUID,
    document_ids: list[str] | None = None,
    indexed_document_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Turn session quick extracts into RAG-style chunks (always high relevance)."""
    attachments = list_for_session(session_id)
    allowed = set(document_ids) if document_ids else None
    indexed = indexed_document_ids or set()
    chunks: list[dict[str, Any]] = []
    for att in attachments:
        if allowed is not None and att.document_id not in allowed:
            continue
        if att.document_id in indexed:
            continue
        if not att.quick_text or is_placeholder_preview(att.quick_text):
            continue
        chunks.append(
            {
                "content": att.quick_text,
                "score": 1.0,
                "metadata": {
                    "file_name": att.file_name,
                    "document_id": att.document_id,
                    "element_type": "session_quick",
                    "index_status": att.index_status,
                    "section_title": "Chat attachment (quick preview)",
                },
            }
        )
    return chunks


def merge_with_vector_results(
    session_chunks: list[dict[str, Any]],
    vector_chunks: list[dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    """Session preview first, then vector hits without duplicating same document_id."""
    merged: list[dict[str, Any]] = []
    seen_docs: set[str] = set()
    for c in session_chunks:
        content = (c.get("content") or "").strip()
        if is_placeholder_preview(content):
            continue
        doc_id = (c.get("metadata") or {}).get("document_id")
        merged.append(c)
        if doc_id:
            seen_docs.add(doc_id)

    for c in vector_chunks:
        if len(merged) >= len(session_chunks) + limit:
            break
        doc_id = (c.get("metadata") or {}).get("document_id")
        if doc_id and doc_id in seen_docs:
            continue
        merged.append(c)

    return merged
