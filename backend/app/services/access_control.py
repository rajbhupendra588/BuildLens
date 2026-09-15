import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.chat import ChatSession
from app.models.document_catalog import DocumentCatalog
from app.models.user import User


def require_chat_session(
    db: Session, user: User, session_id: uuid.UUID
) -> ChatSession:
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session


def require_document_owned(
    db: Session, user: User, document_id: str
) -> DocumentCatalog:
    row = db.get(DocumentCatalog, document_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return row


def owned_document_ids(db: Session, user_id: uuid.UUID) -> set[str]:
    rows = db.exec(
        select(DocumentCatalog.document_id).where(
            DocumentCatalog.user_id == user_id
        )
    ).all()
    return {row for row in rows}


def filter_documents_for_user(
    db: Session, user: User, documents: list[dict]
) -> list[dict]:
    allowed = owned_document_ids(db, user.id)
    return [d for d in documents if d.get("document_id") in allowed]
