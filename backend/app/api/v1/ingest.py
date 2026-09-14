import asyncio
import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.chunking_service import chunking_service
from app.services.document_storage_service import document_storage
from app.services.file_service import file_service
from app.services.fast_ingest_service import try_fast_text_index
from app.services.quick_extract_service import extract_from_document
from app.core.config import settings
from app.services.retrieval_service import retrieval_service
from app.services.session_attachment_service import (
    attach_to_session,
    count_for_session,
    set_index_status,
)
from app.services.vector_service import vector_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

_ingest_semaphore = asyncio.Semaphore(1)
_ingest_jobs: dict[str, dict[str, Any]] = {}


def _index_document_on_disk(document_id: str, filename: str) -> dict:
    """CPU-heavy extract → chunk → embed. File already on disk."""
    started = time.perf_counter()
    path = document_storage.find_path(document_id)
    if not path:
        raise HTTPException(status_code=404, detail="Stored upload not found.")

    file_size = path.stat().st_size
    print(f"[ingest] start {filename!r} from {path} ({file_size} bytes)")

    fast = try_fast_text_index(path, filename)
    if fast is not None:
        final_content = fast.text
        file_type = "text"
        print(
            f"[ingest] fast path {filename!r} via {fast.method} "
            f"({len(final_content)} chars, {time.perf_counter() - started:.1f}s)"
        )
    else:
        raw_content, file_type = file_service.process_stored_file(path, filename)
        print(f"[ingest] docling path {filename!r} → {file_type}")

    if fast is None:
        if file_type == "csv":
            final_content = chunking_service.process_csv(raw_content)
            file_type = "text"
        elif file_type == "xlsx":
            final_content = chunking_service.process_xlsx(raw_content)
            file_type = "text"
        elif file_type == "json":
            final_content = chunking_service.process_json(raw_content)
            file_type = "text"
        elif file_type in {"text", "code"}:
            final_content = (
                raw_content.decode("utf-8", errors="ignore")
                if isinstance(raw_content, bytes)
                else str(raw_content)
            )
        else:
            final_content = raw_content

    chunks = chunking_service.split_content(
        final_content,
        filename,
        document_id,
        file_type=file_type,
    )
    print(f"[ingest] chunked {filename!r} → {len(chunks)} chunks")

    if not chunks:
        elapsed = time.perf_counter() - started
        print(f"[ingest] finished {filename!r} (no text) in {elapsed:.1f}s")
        return {
            "document_id": document_id,
            "file_name": filename,
            "file_type": file_type,
            "total_chunks": 0,
            "chunks_preview": [],
            "status": "success",
            "message": "File was processed but produced no indexable text",
        }

    vector_service.upsert_chunks(chunks, batch_size=8)

    elapsed = time.perf_counter() - started
    print(f"[ingest] indexed {filename!r} ({len(chunks)} chunks) in {elapsed:.1f}s")

    return {
        "document_id": document_id,
        "file_name": filename,
        "file_type": file_type,
        "total_chunks": len(chunks),
        "chunks_preview": chunks[:3],
        "status": "success",
        "message": f"Successfully indexed {len(chunks)} chunks into Vector DB",
    }


def _run_quick_extract(
    session_id: uuid.UUID,
    document_id: str,
    filename: str,
) -> dict[str, Any]:
    quick = extract_from_document(document_id, filename)
    attach_to_session(
        session_id,
        document_id,
        filename,
        quick.text,
        index_status="quick_ready",
    )
    return {
        "quick_chars": len(quick.text),
        "quick_method": quick.method,
        "quick_truncated": quick.truncated,
        "chat_ready": True,
    }


async def _run_ingest_job(
    job_id: str,
    document_id: str,
    filename: str,
    session_id: Optional[uuid.UUID] = None,
) -> None:
    _ingest_jobs[job_id]["status"] = "processing"

    try:
        if session_id:
            quick_meta = await asyncio.to_thread(
                _run_quick_extract, session_id, document_id, filename
            )
            _ingest_jobs[job_id] = {
                **_ingest_jobs[job_id],
                **quick_meta,
                "status": "quick_ready",
                "message": "Ready to chat in this conversation. Full library indexing continues.",
            }
            set_index_status(document_id, "indexing")
        else:
            _ingest_jobs[job_id] = {
                **_ingest_jobs[job_id],
                "status": "processing",
                "message": "Indexing — text PDFs usually finish in under a minute.",
            }

        async with _ingest_semaphore:
            result = await asyncio.to_thread(
                _index_document_on_disk, document_id, filename
            )

        if session_id:
            set_index_status(document_id, "indexed")

        _ingest_jobs[job_id] = {
            **result,
            "job_id": job_id,
            "status": "success",
            "chat_ready": True,
        }
    except HTTPException as exc:
        prior = _ingest_jobs.get(job_id, {})
        if session_id and prior.get("status") == "quick_ready":
            set_index_status(document_id, "error")
            _ingest_jobs[job_id] = {
                **prior,
                "job_id": job_id,
                "status": "partial",
                "chat_ready": True,
                "index_error": exc.detail,
            }
            return
        if session_id:
            set_index_status(document_id, "error")
        document_storage.delete(document_id)
        _ingest_jobs[job_id] = {
            "job_id": job_id,
            "status": "error",
            "file_name": filename,
            "detail": exc.detail,
        }
    except Exception as exc:
        print(f"[ingest] failed {filename!r}: {exc}")
        prior = _ingest_jobs.get(job_id, {})
        if session_id and prior.get("status") == "quick_ready":
            set_index_status(document_id, "error")
            _ingest_jobs[job_id] = {
                **prior,
                "job_id": job_id,
                "status": "partial",
                "chat_ready": True,
                "index_error": str(exc),
            }
            return
        if session_id:
            set_index_status(document_id, "error")
        document_storage.delete(document_id)
        _ingest_jobs[job_id] = {
            "job_id": job_id,
            "status": "error",
            "file_name": filename,
            "detail": str(exc),
        }


@router.get("/jobs/{job_id}")
async def get_ingest_job(job_id: str):
    job = _ingest_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Ingest job not found")
    return job


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
):
    """
    Stream upload to disk, return after bytes are saved.
    With session_id: fast text preview for immediate chat, then full index in background.
    """
    await file_service.validate_file(file)
    filename = file.filename or "unnamed"
    document_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    parsed_session: Optional[uuid.UUID] = None
    if session_id:
        try:
            parsed_session = uuid.UUID(session_id.strip())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid session_id") from exc
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
        indexed = await retrieval_service.list_indexed_documents()
        max_library = settings.STORAGE.MAX_LIBRARY_FILES
        if len(indexed) >= max_library:
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

    _ingest_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "file_name": filename,
        "document_id": document_id,
        "bytes_received": byte_count,
        "receive_seconds": round(receive_seconds, 3),
        "session_id": str(parsed_session) if parsed_session else None,
    }

    asyncio.create_task(
        _run_ingest_job(job_id, document_id, filename, parsed_session)
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "file_name": filename,
        "document_id": document_id,
        "bytes_received": byte_count,
        "receive_seconds": round(receive_seconds, 3),
        "session_id": str(parsed_session) if parsed_session else None,
        "message": "File saved; processing runs in the background.",
    }
