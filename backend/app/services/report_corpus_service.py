"""Load the complete indexed corpus for selected documents (not top-k RAG)."""

from __future__ import annotations

import uuid
from typing import Any

from qdrant_client import models

from app.core.config import settings
from app.services.source_location_service import (
    enrich_location_metadata,
    format_location_label,
)
from app.services.vector_service import is_missing_collection_error, vector_service


def _point_to_chunk(point: Any) -> dict[str, Any] | None:
    payload = point.payload or {}
    meta = dict(payload.get("metadata") or {})
    content = (payload.get("content") or "").strip()
    if not content:
        return None
    if meta.get("element_type") in ("routing_hint", "inventory"):
        return None
    chunk_id = str(point.id) if point.id is not None else meta.get("chunk_id")
    if chunk_id:
        meta["chunk_id"] = chunk_id
    enrich_location_metadata(meta, content)
    return {
        "content": content,
        "metadata": meta,
        "chunk_id": chunk_id,
        "score": 1.0,
    }


def scroll_document_chunks(
    document_ids: list[str],
    *,
    owner_user_id: uuid.UUID | None = None,
) -> list[dict[str, Any]]:
    """Return every indexed chunk for the given documents, ordered by page/index."""
    if not document_ids:
        return []
    vector_service.ensure_collection()
    if not vector_service.collection_exists():
        return []

    query_filter = models.Filter(
        should=[
            models.FieldCondition(
                key="metadata.document_id",
                match=models.MatchValue(value=doc_id),
            )
            for doc_id in document_ids
        ]
    )
    chunks: list[dict[str, Any]] = []
    offset = None
    while True:
        try:
            results, next_offset = vector_service.client.scroll(
                collection_name=settings.QDRANT.COLLECTION_NAME,
                scroll_filter=query_filter,
                limit=256,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )
        except Exception as exc:
            if is_missing_collection_error(exc):
                return []
            raise
        for point in results:
            chunk = _point_to_chunk(point)
            if chunk:
                chunks.append(chunk)
        if next_offset is None:
            break
        offset = next_offset

    if owner_user_id is not None:
        uid = str(owner_user_id)
        chunks = [
            c
            for c in chunks
            if (c.get("metadata") or {}).get("user_id") in (None, uid)
        ]

    def _sort_key(chunk: dict[str, Any]) -> tuple:
        meta = chunk.get("metadata") or {}
        page = meta.get("page_number")
        index = meta.get("chunk_index")
        return (
            str(meta.get("file_name") or ""),
            page if isinstance(page, int) else 10_000,
            index if isinstance(index, int) else 10_000,
        )

    chunks.sort(key=_sort_key)
    return chunks


def assign_source_indices(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Number chunks [1..n] for citations and attach location labels."""
    numbered: list[dict[str, Any]] = []
    index = 0
    for chunk in chunks:
        meta = chunk.setdefault("metadata", {})
        index += 1
        meta["source_index"] = index
        meta["location_label"] = format_location_label(meta)
        numbered.append(chunk)
    return numbered


def group_chunks_hierarchically(
    chunks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Group chunks into document → section (or page) windows for map-reduce."""
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    order: list[tuple[str, str]] = []
    for chunk in chunks:
        meta = chunk.get("metadata") or {}
        doc_id = str(meta.get("document_id") or "unknown")
        file_name = str(meta.get("file_name") or "Unknown")
        section = (
            (meta.get("section_title") or "").strip()
            or (f"Page {meta['page_number']}" if meta.get("page_number") else "Document body")
        )
        key = (doc_id, section)
        if key not in groups:
            groups[key] = {
                "document_id": doc_id,
                "file_name": file_name,
                "section_title": section,
                "chunks": [],
            }
            order.append(key)
        groups[key]["chunks"].append(chunk)
    return [groups[k] for k in order]


def format_chunk_for_prompt(chunk: dict[str, Any]) -> str:
    meta = chunk.get("metadata") or {}
    cite = meta.get("source_index") or "?"
    source = meta.get("file_name") or "Unknown"
    location = meta.get("location_label") or ""
    section = meta.get("section_title") or ""
    header = f"[{cite}] {source}"
    if location:
        header += f" — {location}"
    if section:
        header += f' — "{section}"'
    return f"{header}\n{(chunk.get('content') or '').strip()}"
