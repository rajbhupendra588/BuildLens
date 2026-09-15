import asyncio
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session

from app.core.config import settings
from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.services.access_control import require_chat_session
from app.services.document_catalog_service import document_catalog_service
from app.services.document_storage_service import document_storage
from app.services.file_service import file_service
from app.services.ingest_job_service import (
    create_job,
    get_job,
    job_to_api,
    mark_error,
    mark_quick_ready,
)
from app.services.ingest_pipeline import register_document_catalog, run_quick_extract
from app.services.ingest_worker_pool import get_ingest_worker_pool
from app.services.session_attachment_service import count_for_session

router = APIRouter(prefix="/ingest", tags=["Ingestion"])


async def _master_run_quick_extract(
    job_id: uuid.UUID,
    session_id: uuid.UUID,
    document_id: str,
    filename: str,
) -> None:
    from app.core.database import engine

    try:
        quick_meta = await asyncio.to_thread(
            run_quick_extract, session_id, document_id, filename
        )
        with Session(engine) as db:
            mark_quick_ready(db, job_id, quick_meta)
        get_ingest_worker_pool().notify_work_available()
    except Exception as exc:
        print(f"[ingest] quick extract failed {filename!r}: {exc}")
        with Session(engine) as db:
            mark_error(
                db,
                job_id,
                status="error",
                detail=str(exc),
                preserve_result=False,
            )
        document_storage.delete(document_id)


@router.get("/jobs/{job_id}")
async def get_ingest_job(job_id: str, db: Session = Depends(get_session)):
    try:
        parsed = uuid.UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid job_id") from exc
    job = get_job(db, parsed)
    if not job:
        raise HTTPException(status_code=404, detail="Ingest job not found")
    return job_to_api(job)


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Master: stream bytes to uploads_data, enqueue Postgres job for workers.
    Session uploads: quick text preview on API; full index on ingest worker.
    """
    await file_service.validate_file(file)
    filename = file.filename or "unnamed"
    document_id = str(uuid.uuid4())
    job_id = uuid.uuid4()

    parsed_session: Optional[uuid.UUID] = None
    if session_id:
        try:
            parsed_session = uuid.UUID(session_id.strip())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid session_id") from exc
        require_chat_session(db, current_user, parsed_session)
        max_attach = settings.STORAGE.MAX_SESSION_ATTACHMENTS
        if count_for_session(parsed_session) >= max_attach:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Maximum {max_attach} files per conversation. "
                    "Remove a file before uploading another."
                ),
            )
    else:
        library_count = document_catalog_service.count_for_user(db, current_user.id)
        max_library = settings.STORAGE.MAX_LIBRARY_FILES
        if library_count >= max_library:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Library limit reached (max {max_library} files). "
                    "Remove a file before uploading another."
                ),
            )

    receive_started = time.perf_counter()
    _path, byte_count = await document_storage.save_upload_stream(
        document_id, filename, file
    )
    receive_seconds = time.perf_counter() - receive_started

    create_job(
        db,
        job_id=job_id,
        document_id=document_id,
        filename=filename,
        owner_user_id=current_user.id,
        session_id=parsed_session,
        bytes_received=byte_count,
        receive_seconds=round(receive_seconds, 3),
    )

    if not parsed_session:
        get_ingest_worker_pool().notify_work_available()

    await asyncio.to_thread(
        register_document_catalog, document_id, filename, current_user.id
    )

    if parsed_session:
        asyncio.create_task(
            _master_run_quick_extract(
                job_id, parsed_session, document_id, filename
            )
        )

    return {
        "job_id": str(job_id),
        "status": "queued",
        "file_name": filename,
        "document_id": document_id,
        "bytes_received": byte_count,
        "receive_seconds": round(receive_seconds, 3),
        "session_id": str(parsed_session) if parsed_session else None,
        "message": "File saved; indexing runs on ingest worker.",
    }
