from datetime import datetime
from typing import Any, List, Optional
from sqlmodel import Session, select
from app.models.chat import ChatSession, ChatMessage
import uuid

class ChatHistoryService:
    def create_session(
        self, db: Session, title: str = "New Chat", user_id: uuid.UUID | None = None
    ):
        session = ChatSession(title=title, user_id=user_id)
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    def add_message(
        self,
        db: Session,
        session_id: uuid.UUID,
        role: str,
        content: str,
        provider: str,
        model: str,
        sources: Optional[List[Any]] = None,
        detected_mode: Optional[str] = None,
        media: Optional[List[Any]] = None,
    ):
        message = ChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            provider=provider,
            model=model,
            sources=sources,
            detected_mode=detected_mode,
            media=media,
        )
        db.add(message)
        session = db.get(ChatSession, session_id)
        if session:
            session.updated_at = datetime.utcnow()
            db.add(session)
        db.commit()
        return message
    
    def get_history(self, db: Session, session_id: uuid.UUID, limit: int = 10):
        statement = select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.desc()).limit(limit)
        messages = db.exec(statement).all()
        return sorted(messages, key=lambda x: x.created_at)

    def get_session_message(self, db: Session, session_id: uuid.UUID):
        statement = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
        )

        return db.exec(statement).all()

    def update_session_title(self, db: Session, session_id: uuid.UUID, new_title: str):
        session = db.get(ChatSession, session_id)
        if session:
            session.title = new_title
            session.updated_at = datetime.utcnow()
            db.add(session)
            db.commit()
            db.refresh(session)
        return session

    def set_session_pinned(
        self, db: Session, session_id: uuid.UUID, is_pinned: bool
    ) -> ChatSession | None:
        session = db.get(ChatSession, session_id)
        if not session:
            return None
        session.is_pinned = is_pinned
        session.updated_at = datetime.utcnow()
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    def delete_session(self, db: Session, session_id: uuid.UUID):
        session = db.get(ChatSession, session_id)
        if session:
            db.delete(session)
            db.commit()
            return True
        return False

    def rollback_from_message(
        self, db: Session, session_id: uuid.UUID, message_id: uuid.UUID
    ) -> Optional[int]:
        """Delete this message and every later message in the session.

        Returns the number of deleted rows, or None if the message is missing.
        """
        messages = self.get_session_message(db, session_id)
        index = next((i for i, m in enumerate(messages) if m.id == message_id), None)
        if index is None:
            return None
        to_delete = messages[index:]
        for message in to_delete:
            db.delete(message)
        db.commit()
        return len(to_delete)


chat_history_service = ChatHistoryService()
