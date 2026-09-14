from __future__ import annotations

import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.database import engine
from app.models.session_attachment import SessionAttachment


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


def list_for_session(session_id: uuid.UUID) -> list[SessionAttachment]:
    with _db() as db:
        return list(
            db.exec(
                select(SessionAttachment)
                .where(SessionAttachment.session_id == session_id)
                .order_by(SessionAttachment.created_at.desc())
            ).all()
        )


def build_session_context_chunks(
    session_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Turn session quick extracts into RAG-style chunks (always high relevance)."""
    attachments = list_for_session(session_id)
    chunks: list[dict[str, Any]] = []
    for att in attachments:
        if not att.quick_text or not att.quick_text.strip():
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
    merged: list[dict[str, Any]] = list(session_chunks)
    seen_docs: set[str] = set()
    for c in session_chunks:
        doc_id = (c.get("metadata") or {}).get("document_id")
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
