from datetime import datetime
import uuid

from sqlalchemy import Column, ForeignKey
from sqlmodel import Field, SQLModel
import sqlalchemy.dialects.postgresql as pg


class DocumentCatalog(SQLModel, table=True):
    """PostgreSQL registry for indexed library files (metadata not stored in Qdrant)."""

    document_id: str = Field(primary_key=True, max_length=64)
    file_name: str = Field(max_length=512, index=True)
    collection: str = Field(default="general", max_length=64, index=True)
    user_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            pg.UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
    )
    updated_at: datetime = Field(default_factory=datetime.utcnow)
