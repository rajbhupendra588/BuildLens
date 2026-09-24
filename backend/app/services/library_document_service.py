"""Merge Qdrant index + catalog + ingest jobs for the library UI."""

from __future__ import annotations

from typing import Any

from app.models.document_catalog import DocumentCatalog
from app.models.ingest_job import IngestJob
from app.services.vector_service import vector_service


def add_catalog_chunk_counts(
    indexed_by_id: dict[str, dict[str, Any]],
    catalog_rows: list[DocumentCatalog],
) -> dict[str, dict[str, Any]]:
    """Fill documents Qdrant listing missed (e.g. ingest lock) using per-file counts."""
    for row in catalog_rows:
        if row.document_id in indexed_by_id:
            continue
        chunk_count = vector_service.count_chunks_for_document(row.document_id)
        if chunk_count <= 0:
            continue
        indexed_by_id[row.document_id] = {
            "document_id": row.document_id,
            "file_name": row.file_name,
            "chunk_count": chunk_count,
        }
    return indexed_by_id


def derive_index_status(
    *,
    indexed: dict[str, Any] | None,
    job: IngestJob | None,
) -> tuple[str, str | None]:
    """
    index_status: indexed | indexing | error | partial

    An in-flight job wins so a file uploaded today still shows progress.
    A completed job, or leftover chunks with no active job, show as indexed.
    """
    if job is not None:
        if job.status == "error":
            return "error", job.error_detail
        if job.status == "partial":
            return "partial", job.error_detail or job.message
        if job.status in {"queued", "processing", "quick_ready"}:
            return "indexing", None
        if job.status == "success":
            return "indexed", None

    chunk_count = (indexed or {}).get("chunk_count") or 0
    if chunk_count > 0:
        return "indexed", None
    return "indexing", None
