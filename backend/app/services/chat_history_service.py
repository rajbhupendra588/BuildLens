from typing import Any, List, Optional
from sqlmodel import Session, select
from app.models.chat import ChatSession, ChatMessage
import uuid

class ChatHistoryService:
    def create_session(self, db: Session, title: str = "New Chat"):
        session = ChatSession(title=title)
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
    ):
        message = ChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            provider=provider,
            model=model,
            sources=sources,
            detected_mode=detected_mode,
        )
        db.add(message)
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


chat_history_service = ChatHistoryService()
