"""Orchestrate /report: authorize, load full corpus, analyze, PDF, persist."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.models.document_catalog import DocumentCatalog
from app.models.ingest_job import IngestJob
from app.models.report import DocumentReport
from app.models.user import User
from app.schemas.report import (
    ReportContent,
    ReportResponse,
    ReportStatus,
    ReportType,
)
from app.services.access_control import require_document_owned
from app.services.report_analysis_service import report_analysis_service
from app.services.report_corpus_service import assign_source_indices, scroll_document_chunks
from app.services.report_pdf_service import generate_report_pdf, report_download_name
from app.services.session_attachment_service import list_for_session

# Future /report subtypes (summary, technical, risks, …) register here.
REPORT_ANALYZERS = {
    ReportType.FULL_DOCUMENT_REPORT.value: report_analysis_service,
}

ProgressCb = Callable[[str], Awaitable[None]] | None

PROCESSING_JOB_STATUSES = {"queued", "processing", "quick_ready"}
INDEXED_JOB_STATUSES = {"success", "partial"}

DOC_STILL_PROCESSING = (
    "The document is still being processed. Report generation will be available "
    "when indexing is complete."
)
DOC_NO_CONTENT = (
    "BuildLens could not extract enough content to generate a reliable report."
)
GEN_FAILED = "We couldn't generate the report. Please try again."
PARTIAL_NOTE = (
    "Report generated from the content currently available. "
    "Some document elements could not be analyzed."
)


def _reports_root() -> Path:
    root = Path(settings.STORAGE.REPORTS_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _pdf_url(report_id: uuid.UUID) -> str:
    return f"/api/v1/reports/{report_id}/pdf"


class ReportGenerationError(Exception):
    def __init__(self, message: str, *, http_status: int = 400):
        super().__init__(message)
        self.message = message
        self.http_status = http_status


def to_response(row: DocumentReport, *, include_content: bool = True) -> ReportResponse:
    content = row.content if isinstance(row.content, dict) else None
    names = []
    limitations = None
    if content:
        names = list(content.get("document_names") or [])
        limitations = content.get("limitations")
    generated = row.completed_at or row.created_at
    return ReportResponse(
        reportId=str(row.id),
        status=row.status,
        reportType=row.report_type,
        title=row.title,
        documentCount=len(row.document_ids or []),
        documentNames=names,
        pageCount=row.page_count,
        generatedAt=generated,
        pdfUrl=_pdf_url(row.id) if row.status == ReportStatus.COMPLETED.value and row.pdf_path else None,
        downloadName=row.download_name,
        limitations=limitations,
        errorMessage=row.error_message,
        sections=content if include_content and row.status == ReportStatus.COMPLETED.value else None,
        content=content if include_content and row.status == ReportStatus.COMPLETED.value else None,
    )


def _latest_ingest_job(db: Session, document_id: str) -> IngestJob | None:
    statement = (
        select(IngestJob)
        .where(IngestJob.document_id == document_id)
        .order_by(IngestJob.created_at.desc())
    )
    return db.exec(statement).first()


def resolve_document_ids(
    db: Session,
    user: User,
    requested_ids: list[str],
    *,
    session_id: uuid.UUID | None,
    scoped_library_ids: list[str] | None = None,
) -> list[str]:
    """Authorize requested IDs, else session attachments, else scoped library."""
    ids = [d.strip() for d in requested_ids if d and d.strip()]
    if ids:
        for doc_id in ids:
            require_document_owned(db, user, doc_id)
        return ids

    if session_id:
        attachments = list_for_session(session_id)
        attached = [a.document_id for a in attachments if a.document_id]
        if attached:
            for doc_id in attached:
                require_document_owned(db, user, doc_id)
            return attached

    if scoped_library_ids:
        for doc_id in scoped_library_ids:
            require_document_owned(db, user, doc_id)
        return list(scoped_library_ids)

    rows = db.exec(
        select(DocumentCatalog).where(DocumentCatalog.user_id == user.id)
    ).all()
    return [r.document_id for r in rows]


def validate_documents_ready(
    db: Session, document_ids: list[str], chunk_count: int
) -> tuple[bool, str | None]:
    """Return (partial, error_message). error_message means generation must stop."""
    if not document_ids:
        return False, "No documents are in the current report scope."

    still_processing = False
    any_indexed_job = False
    for doc_id in document_ids:
        job = _latest_ingest_job(db, doc_id)
        if job and job.status in PROCESSING_JOB_STATUSES:
            still_processing = True
        if job and job.status in INDEXED_JOB_STATUSES:
            any_indexed_job = True

    if chunk_count == 0:
        if still_processing:
            return False, DOC_STILL_PROCESSING
        return False, DOC_NO_CONTENT

    if still_processing and not any_indexed_job:
        # Chunks exist from a previous index; allow partial.
        return True, None
    if still_processing:
        return True, None
    return False, None


class ReportService:
    def create_report(
        self,
        db: Session,
        user: User,
        document_ids: list[str],
        *,
        report_type: str = ReportType.FULL_DOCUMENT_REPORT.value,
        session_id: uuid.UUID | None = None,
        project_id: str | None = None,
        title: str = "Document Report",
    ) -> DocumentReport:
        if report_type != ReportType.FULL_DOCUMENT_REPORT.value:
            report_type = ReportType.FULL_DOCUMENT_REPORT.value
        row = DocumentReport(
            created_by=user.id,
            session_id=session_id,
            project_id=project_id,
            document_ids=document_ids,
            report_type=report_type,
            status=ReportStatus.QUEUED.value,
            title=title,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def get_owned(self, db: Session, user: User, report_id: uuid.UUID) -> DocumentReport:
        row = db.get(DocumentReport, report_id)
        if row is None or row.created_by != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
        return row

    def _set_status(
        self,
        db: Session,
        row: DocumentReport,
        status_value: str,
        **fields: Any,
    ) -> DocumentReport:
        row.status = status_value
        for key, value in fields.items():
            setattr(row, key, value)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    async def generate(
        self,
        db: Session,
        row: DocumentReport,
        user: User,
        *,
        provider: str,
        model: str,
        api_key: Optional[str] = None,
        progress: ProgressCb = None,
        document_names: list[str] | None = None,
    ) -> DocumentReport:
        await self._emit(progress, "Analyzing document...")
        self._set_status(db, row, ReportStatus.ANALYZING.value)

        names = document_names or self._names_for_ids(db, row.document_ids or [])
        if len(names) == 1:
            row.title = f"Document Report — {names[0]}"
        elif names:
            row.title = f"Document Report — {len(names)} documents"
        db.add(row)
        db.commit()

        chunks = await asyncio.to_thread(
            scroll_document_chunks,
            row.document_ids or [],
            owner_user_id=user.id,
        )
        partial, error = validate_documents_ready(db, row.document_ids or [], len(chunks))
        if error:
            return self._set_status(
                db,
                row,
                ReportStatus.FAILED.value,
                error_message=error,
                completed_at=datetime.utcnow(),
            )

        chunks = assign_source_indices(chunks)
        try:
            analyzer = REPORT_ANALYZERS.get(row.report_type, report_analysis_service)
            content = await analyzer.analyze(
                chunks,
                names,
                provider=provider,
                model=model,
                api_key=api_key,
                progress=progress,
                partial=partial,
            )
        except Exception as exc:
            print(f"[report] analysis failed: {exc}")
            return self._set_status(
                db,
                row,
                ReportStatus.FAILED.value,
                error_message=GEN_FAILED,
                completed_at=datetime.utcnow(),
            )

        if not self._has_minimum_signal(content):
            return self._set_status(
                db,
                row,
                ReportStatus.FAILED.value,
                error_message=DOC_NO_CONTENT,
                completed_at=datetime.utcnow(),
            )

        await self._emit(progress, "Generating PDF...")
        self._set_status(db, row, ReportStatus.GENERATING.value)
        generated = datetime.utcnow().strftime("%Y-%m-%d")
        stamp = datetime.utcnow().strftime("%Y%m%d")
        try:
            pdf_bytes, page_count = await asyncio.to_thread(
                generate_report_pdf, content, generated
            )
        except Exception as exc:
            print(f"[report] PDF failed: {exc}")
            return self._set_status(
                db,
                row,
                ReportStatus.FAILED.value,
                error_message=GEN_FAILED,
                completed_at=datetime.utcnow(),
            )

        if page_count < 1 or page_count > 5:
            return self._set_status(
                db,
                row,
                ReportStatus.FAILED.value,
                error_message=GEN_FAILED,
                completed_at=datetime.utcnow(),
            )

        download_name = report_download_name(names, stamp)
        pdf_path = _reports_root() / str(user.id) / f"{row.id}.pdf"
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        pdf_path.write_bytes(pdf_bytes)

        payload = content.model_dump()
        if partial and not payload.get("limitations"):
            payload["limitations"] = PARTIAL_NOTE

        return self._set_status(
            db,
            row,
            ReportStatus.COMPLETED.value,
            content=payload,
            page_count=page_count,
            pdf_path=str(pdf_path),
            download_name=download_name,
            title=content.title,
            completed_at=datetime.utcnow(),
        )

    def _names_for_ids(self, db: Session, document_ids: list[str]) -> list[str]:
        names: list[str] = []
        for doc_id in document_ids:
            row = db.get(DocumentCatalog, doc_id)
            names.append(row.file_name if row else doc_id)
        return names

    def _has_minimum_signal(self, content: ReportContent) -> bool:
        return bool(
            content.executive_summary
            or content.key_facts
            or content.metrics
            or content.top_findings
            or content.sources
        )

    async def _emit(self, progress: ProgressCb, message: str) -> None:
        if progress is None:
            return
        await progress(message)


report_service = ReportService()
