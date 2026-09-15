from datetime import datetime
from typing import Any, Optional
import uuid

from sqlalchemy import Column, ForeignKey, JSON
from sqlmodel import Field, SQLModel
import sqlalchemy.dialects.postgresql as pg


class DocumentReport(SQLModel, table=True):
    """Persisted document intelligence report (structured content + PDF)."""

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(pg.UUID(as_uuid=True), primary_key=True),
    )
    project_id: Optional[str] = Field(default=None, max_length=128)
    created_by: uuid.UUID = Field(
        sa_column=Column(
            pg.UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    session_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(pg.UUID(as_uuid=True), nullable=True, index=True),
    )
    document_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    report_type: str = Field(default="FULL_DOCUMENT_REPORT", max_length=64, index=True)
    status: str = Field(default="QUEUED", max_length=32, index=True)
    title: str = Field(default="Document Report", max_length=512)
    page_count: Optional[int] = Field(default=None)
    content: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    pdf_path: Optional[str] = Field(default=None, max_length=1024)
    download_name: Optional[str] = Field(default=None, max_length=512)
    error_message: Optional[str] = Field(default=None, max_length=2048)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    completed_at: Optional[datetime] = Field(default=None)
