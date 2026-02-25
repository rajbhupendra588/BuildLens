from datetime import datetime
from typing import Any, List, Optional
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, JSON
import sqlalchemy.dialects.postgresql as pg
import uuid

class ChatSession(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(default="New Conversation")

    provider: str = Field(default="ollama")
    model_name: str = Field(default="minimax-m2:cloud")

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    messages: List["ChatMessage"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

class ChatMessage(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("chatsession.id", ondelete="CASCADE"), nullable=False)
    )
    role: str = Field(index=True)  # user, assistant, system
    content: str
    provider: str = Field(default="ollama")
    model: str = Field(default="")
    # Retrieved source chunks stored as JSON (assistant messages only)
    sources: Optional[List[Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    # Detected intent mode for this message (assistant messages only)
    detected_mode: Optional[str] = Field(default=None, max_length=50)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    session: ChatSession = Relationship(back_populates="messages")