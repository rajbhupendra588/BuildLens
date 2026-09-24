"""
Ingest worker: polls Postgres for jobs and indexes files from uploads_data.

Run: python -m app.workers.ingest_worker
"""

from __future__ import annotations

import time

from sqlmodel import Session

from app.core.config import settings
from app.core.database import engine, init_db
from app.models.ingest_job import IngestJob  # noqa: F401 — register table
from app.services.ingest_job_service import claim_next_job, mark_error, mark_success
from app.services.ingest_pipeline import run_full_index_job
from app.services.quick_extract_service import quiet_pdf_parser_logs


def process_one_job(job: IngestJob, worker_id: str) -> None:
    job_id = job.id
    had_quick = job.session_id is not None and bool(
        (job.result or {}).get("chat_ready")
    )
    try:
        result = run_full_index_job(
            document_id=job.document_id,
            filename=job.file_name,
            owner_user_id=job.owner_user_id,
            session_id=job.session_id,
            had_quick_ready=bool(had_quick),
        )
        with Session(engine) as session:
            mark_success(session, job_id, {**result, "job_id": str(job_id)})
    except Exception as exc:
        with Session(engine) as session:
            mark_error(
                session,
                job_id,
                status="error",
                detail=str(exc),
                preserve_result=bool(job.session_id and had_quick),
            )


def run_loop(worker_id: str, poll_seconds: float | None = None) -> None:
    poll = poll_seconds if poll_seconds is not None else settings.INGEST.WORKER_POLL_SECONDS
    print(f"[ingest-worker] started id={worker_id} poll={poll}s")

    while True:
        job = None
        with Session(engine) as session:
            job = claim_next_job(session, worker_id)
            if job:
                session.expunge(job)
        if job:
            print(
                f"[ingest-worker] claimed job={job.id} doc={job.document_id!r} "
                f"file={job.file_name!r}"
            )
            process_one_job(job, worker_id)
            continue
        time.sleep(poll)


def main() -> None:
    """Standalone ingest master + worker pool (no HTTP API)."""
    quiet_pdf_parser_logs()
    init_db()
    from app.services.ingest_worker_pool import get_ingest_worker_pool

    pool = get_ingest_worker_pool()
    pool.master_start()
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
