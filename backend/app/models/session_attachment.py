import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel
from sqlalchemy import Column, Text
import sqlalchemy.dialects.postgresql as pg


class SessionAttachment(SQLModel, table=True):
    """File linked to a chat session with fast-extract text for immediate Q&A."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(
        sa_column=Column(
            pg.UUID(as_uuid=True),
            nullable=False,
            index=True,
        ),
    )
    document_id: str = Field(index=True, max_length=64)
    file_name: str = Field(max_length=512)
    quick_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    # quick_ready → indexing → indexed | error
    index_status: str = Field(default="indexing", max_length=32)
    created_at: datetime = Field(default_factory=datetime.utcnow)
