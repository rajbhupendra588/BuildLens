from datetime import datetime
import uuid
from typing import Any

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel
import sqlalchemy.dialects.postgresql as pg


class IngestJob(SQLModel, table=True):
    """Persistent queue for upload → index pipeline (master enqueues, workers process)."""

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(pg.UUID(as_uuid=True), primary_key=True),
    )
    document_id: str = Field(max_length=64, index=True)
    file_name: str = Field(max_length=512)
    owner_user_id: uuid.UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), nullable=False, index=True),
    )
    session_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(pg.UUID(as_uuid=True), nullable=True, index=True),
    )
    status: str = Field(default="queued", max_length=32, index=True)
    message: str | None = Field(default=None, max_length=512)
    worker_id: str | None = Field(default=None, max_length=128)
    result: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    error_detail: str | None = Field(default=None, max_length=2048)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: datetime | None = Field(default=None)
    finished_at: datetime | None = Field(default=None)
