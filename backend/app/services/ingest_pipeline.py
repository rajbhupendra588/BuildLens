"""Shared extract → chunk → embed logic (runs in ingest worker processes)."""

from __future__ import annotations

import gc
import time
import uuid
from pathlib import Path
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
from app.services.ingest_limits import IngestLimitError, check_chunk_count
from app.services.retrieval_service import retrieval_service
from app.services.vector_service import vector_service
from app.core.database import engine
from sqlmodel import Session

from app.services.document_catalog_service import document_catalog_service


def _tabular_file_type(filename: str) -> str | None:
    ext = Path(filename).suffix.lower()
    if ext == ".csv":
        return "csv"
    if ext == ".xlsx":
        return "xlsx"
    return None


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

    retrieval_service.delete_document_by_id_sync(document_id)
    retrieval_service.invalidate_indexed_documents_cache()

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
        tabular_type = _tabular_file_type(filename)
        if tabular_type:
            file_type = tabular_type
            raw_content = None
            print(f"[ingest] tabular {filename!r} → {file_type}")
        else:
            raw_content, file_type = file_service.process_stored_file(path, filename)
            print(f"[ingest] extract {filename!r} → {file_type}")

    use_tabular = fast is None and file_type in {"csv", "xlsx"}
    final_content: Any = None

    if fast is None and not use_tabular:
        if file_type == "json":
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
    elif fast is not None:
        final_content = fast.text

    total_chunks = 0
    chunks_preview: list[dict] = []
    if use_tabular:
        batch_iter = chunking_service.iter_tabular_index_batches(
            path,
            filename,
            document_id,
            file_type,
            owner_user_id=str(owner_user_id),
        )
    else:
        batch_iter = chunking_service.iter_split_batches(
            final_content,
            filename,
            document_id,
            file_type=file_type,
            owner_user_id=str(owner_user_id),
        )

    for batch in batch_iter:
        if not batch:
            continue
        total_chunks += len(batch)
        check_chunk_count(total_chunks, file_name=filename)
        if len(chunks_preview) < 3:
            chunks_preview.extend(batch[: 3 - len(chunks_preview)])
        vector_service.upsert_chunks(batch)
        del batch
        if use_tabular and total_chunks % 64 == 0:
            gc.collect()

    print(f"[ingest] chunked {filename!r} → {total_chunks} chunks")

    if total_chunks == 0:
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

    elapsed = time.perf_counter() - started
    print(f"[ingest] indexed {filename!r} ({total_chunks} chunks) in {elapsed:.1f}s")
    retrieval_service.invalidate_indexed_documents_cache()

    return {
        "document_id": document_id,
        "file_name": filename,
        "file_type": file_type,
        "total_chunks": total_chunks,
        "chunks_preview": chunks_preview,
        "status": "success",
        "message": f"Successfully indexed {total_chunks} chunks into Vector DB",
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
    except IngestLimitError as exc:
        print(f"[ingest] limit {filename!r}: {exc}")
        raise
    except FileNotFoundError:
        print(f"[ingest] missing original {filename!r} ({document_id})")
        if session_id:
            set_index_status(document_id, "error")
        raise
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
        raise
