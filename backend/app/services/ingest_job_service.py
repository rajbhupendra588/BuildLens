from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from app.core.database import engine
from app.models.ingest_job import IngestJob


def _claimable_filter():
    return or_(
        and_(IngestJob.status == "queued", IngestJob.session_id.is_(None)),
        IngestJob.status == "quick_ready",
    )


def count_claimable_jobs() -> int:
    with Session(engine) as session:
        stmt = select(func.count()).select_from(IngestJob).where(_claimable_filter())
        return int(session.exec(stmt).one())


def create_job(
    session: Session,
    *,
    job_id: uuid.UUID,
    document_id: str,
    filename: str,
    owner_user_id: uuid.UUID,
    session_id: uuid.UUID | None,
    bytes_received: int,
    receive_seconds: float,
) -> IngestJob:
    job = IngestJob(
        id=job_id,
        document_id=document_id,
        file_name=filename,
        owner_user_id=owner_user_id,
        session_id=session_id,
        status="queued",
        message="File saved; waiting for indexer.",
        result={
            "bytes_received": bytes_received,
            "receive_seconds": receive_seconds,
        },
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


def get_job(session: Session, job_id: uuid.UUID) -> IngestJob | None:
    return session.get(IngestJob, job_id)


def job_to_api(job: IngestJob) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "job_id": str(job.id),
        "status": job.status,
        "file_name": job.file_name,
        "document_id": job.document_id,
        "session_id": str(job.session_id) if job.session_id else None,
        "message": job.message,
    }
    if job.result:
        payload.update(job.result)
    if job.error_detail:
        payload["detail"] = job.error_detail
        if job.status == "partial":
            payload["index_error"] = job.error_detail
    return payload


def mark_quick_ready(
    session: Session, job_id: uuid.UUID, quick_meta: dict[str, Any]
) -> None:
    job = session.get(IngestJob, job_id)
    if not job:
        return
    merged = {**(job.result or {}), **quick_meta}
    job.result = merged
    job.status = "quick_ready"
    job.message = (
        "Ready to chat in this conversation. Full library indexing continues."
    )
    job.updated_at = datetime.utcnow()
    session.add(job)
    session.commit()


def mark_processing(session: Session, job: IngestJob, worker_id: str) -> None:
    job.status = "processing"
    job.worker_id = worker_id
    job.message = "Indexing — text PDFs usually finish in under a minute."
    job.started_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    session.add(job)
    session.commit()
    session.refresh(job)


def mark_success(session: Session, job_id: uuid.UUID, result: dict[str, Any]) -> None:
    job = session.get(IngestJob, job_id)
    if not job:
        return
    job.result = {**(job.result or {}), **result}
    job.status = result.get("status", "success")
    job.message = result.get("message")
    job.finished_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    session.add(job)
    session.commit()


def mark_error(
    session: Session,
    job_id: uuid.UUID,
    *,
    status: str,
    detail: str,
    preserve_result: bool = True,
) -> None:
    job = session.get(IngestJob, job_id)
    if not job:
        return
    if preserve_result and job.result:
        job.result = {**job.result, "chat_ready": job.result.get("chat_ready", False)}
    job.status = status
    job.error_detail = detail[:2048]
    job.finished_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    session.add(job)
    session.commit()


def claim_next_job(session: Session, worker_id: str) -> IngestJob | None:
    """Claim one job: library uploads (queued, no session) or session after quick_ready."""
    stmt = (
        select(IngestJob)
        .where(_claimable_filter())
        .order_by(IngestJob.created_at)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    job = session.exec(stmt).first()
    if not job:
        return None
    mark_processing(session, job, worker_id)
    return job
