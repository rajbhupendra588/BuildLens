from fastapi import APIRouter, Depends
from sqlmodel import Session, delete

from app.core.database import get_session
from app.models.chat import ChatSession
from app.services.vector_service import vector_service

router = APIRouter(prefix="/data", tags=["Data"])


@router.get("/stats")
def get_stats():
    """Return total chunks and unique files in the vector store."""
    return vector_service.get_stats()


@router.delete("/vector")
def clear_vector_store():
    """Delete all points from the Qdrant collection (recreate empty)."""
    vector_service.clear_all()
    return {"message": "Vector store cleared"}


@router.delete("/chat")
def clear_chat_history(db: Session = Depends(get_session)):
    """Delete all chat sessions (cascades to messages)."""
    db.exec(delete(ChatSession))
    db.commit()
    return {"message": "Chat history cleared"}
