"""Shared extract → chunk → embed logic (runs in ingest worker processes)."""

from __future__ import annotations

import time
import uuid
from typing import Any

from app.services.chunking_service import chunking_service
from app.services.document_storage_service import document_storage
from app.services.fast_ingest_service import try_fast_text_index
from app.services.file_service import file_service
from app.services.quick_extract_service import extract_from_document
from app.services.session_attachment_service import (
    attach_to_session,
    on_library_index_complete,
    set_index_status,
)
from app.services.vector_service import vector_service
from app.core.database import engine
from sqlmodel import Session

from app.services.document_catalog_service import document_catalog_service


def register_document_catalog(
    document_id: str, filename: str, owner_user_id: uuid.UUID
) -> None:
    with Session(engine) as db:
        document_catalog_service.upsert(
            db, document_id, filename, user_id=owner_user_id
        )


def index_document_on_disk(
    document_id: str, filename: str, owner_user_id: uuid.UUID
) -> dict[str, Any]:
    """CPU-heavy extract → chunk → embed. File already under uploads_data."""
    started = time.perf_counter()
    path = document_storage.find_path(document_id)
    if not path:
        raise FileNotFoundError("Stored upload not found.")

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
        owner_user_id=str(owner_user_id),
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

    vector_service.upsert_chunks(chunks)

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


def run_quick_extract(
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


def run_full_index_job(
    *,
    document_id: str,
    filename: str,
    owner_user_id: uuid.UUID,
    session_id: uuid.UUID | None,
    had_quick_ready: bool,
) -> dict[str, Any]:
    """
    Full vector index + cleanup. Returns API-shaped job payload.
    Raises on unrecoverable library failures; returns partial dict for session index errors.
    """
    try:
        if session_id:
            set_index_status(document_id, "indexing")
        result = index_document_on_disk(document_id, filename, owner_user_id)
        on_library_index_complete(document_id)
        register_document_catalog(document_id, filename, owner_user_id)
        return {
            **result,
            "status": "success",
            "chat_ready": True,
        }
    except Exception as exc:
        print(f"[ingest] failed {filename!r}: {exc}")
        if session_id and had_quick_ready:
            set_index_status(document_id, "error")
            return {
                "status": "partial",
                "chat_ready": True,
                "index_error": str(exc),
                "file_name": filename,
                "document_id": document_id,
            }
        if session_id:
            set_index_status(document_id, "error")
        document_storage.delete(document_id)
        raise
