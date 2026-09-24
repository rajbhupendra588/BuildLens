import re
import threading
import time
import uuid
from pathlib import Path
from typing import List, Dict, Any
from app.core.config import settings
from app.services.source_location_service import (
    enrich_location_metadata,
    format_location_label,
)
from app.services.vector_service import (
    is_missing_collection_error,
    vector_db_heavy_lock,
    vector_service,
)
from qdrant_client import models

# Meta-questions about the KB itself (file count, list uploads) — not document content.
_QUERY_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "what",
        "which",
        "who",
        "whom",
        "this",
        "that",
        "these",
        "those",
        "my",
        "your",
        "our",
        "their",
        "me",
        "you",
        "we",
        "they",
        "it",
        "all",
        "about",
        "can",
        "could",
        "would",
        "should",
        "tell",
        "explain",
        "describe",
        "show",
        "give",
        "please",
        "do",
        "does",
        "did",
        "how",
        "when",
        "where",
        "why",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "and",
        "or",
        "with",
        "from",
        "file",
        "document",
        "upload",
        "uploaded",
        "pdf",
    }
)

_INVENTORY_QUERY = re.compile(
    r"(?i)("
    r"how\s+many\s+(?:documents?|files?|pdfs?|items?|uploads?|things?)"
    r"|how\s+many\s+.*\bknowledge\s*bases?\b"
    r"|how\s+many\b.*\b(?:in|indexed|uploaded)"
    r"|what\s+(?:documents?|files?)\s+(?:are|do\s+i\s+have|in|uploaded|indexed)"
    r"|list\s+(?:all\s+)?(?:my\s+)?(?:documents?|files?|uploads?)"
    r"|what\s+(?:is|are)\s+in\s+(?:my\s+)?knowledge\s*base"
    r"|what\s+(?:documents?|files?)\s+(?:are\s+)?(?:in\s+)?(?:my\s+)?knowledge\s*base"
    r"|\bknowledge\s*base\b.*\b(?:how\s+many|count|number\s+of|list|what\s+files?)"
    r")",
)


_INDEXED_DOCS_CACHE_TTL_SECONDS = 5.0


class RetrievalService:
    def __init__(self):
        self.client = vector_service.client
        self.collection_name = settings.QDRANT.COLLECTION_NAME
        self._indexed_docs_cache: tuple[float, list[dict[str, Any]]] | None = None
        self._indexed_docs_cache_lock = threading.Lock()

    def invalidate_indexed_documents_cache(self) -> None:
        with self._indexed_docs_cache_lock:
            self._indexed_docs_cache = None

    @property
    def model(self):
        return vector_service.model

    def is_knowledge_base_inventory_query(self, query: str) -> bool:
        return bool(_INVENTORY_QUERY.search(query.strip()))

    @staticmethod
    def _query_tokens(query: str) -> set[str]:
        raw = re.findall(r"[a-z0-9]{2,}", query.lower())
        return {t for t in raw if t not in _QUERY_STOPWORDS}

    @staticmethod
    def _filename_tokens(file_name: str) -> set[str]:
        stem = Path(file_name).stem if file_name else ""
        normalized = re.sub(r"[_\-.]+", " ", stem.lower())
        return RetrievalService._query_tokens(normalized)

    def score_filename_relevance(self, query: str, file_name: str) -> float:
        """How well the query refers to this file name (0–1+)."""
        q_tokens = self._query_tokens(query)
        if not q_tokens or not file_name:
            return 0.0

        name_lower = file_name.lower()
        name_tokens = self._filename_tokens(file_name)
        overlap = q_tokens & name_tokens
        score = len(overlap) / max(len(q_tokens), 1)

        for token in q_tokens:
            if len(token) >= 4 and token in name_lower:
                score += 0.5
            elif len(token) >= 3 and token in name_lower:
                score += 0.25

        return score

    def resolve_query_to_documents(
        self,
        query: str,
        documents: list[dict[str, Any]],
    ) -> list[str] | None:
        """
        If the user names or describes a specific uploaded file (e.g. "tableau sample
        data"), return that document_id so retrieval does not pull unrelated PDFs.
        """
        if not documents:
            return None

        scored: list[tuple[float, str, str]] = []
        for doc in documents:
            file_name = doc.get("file_name") or ""
            doc_id = doc.get("document_id")
            if not doc_id or not file_name:
                continue
            score = self.score_filename_relevance(query, file_name)
            if score > 0:
                scored.append((score, doc_id, file_name))

        if not scored:
            return None

        scored.sort(key=lambda x: x[0], reverse=True)
        best_score, best_id, _ = scored[0]
        if best_score < 0.35:
            return None

        result = [best_id]
        if len(scored) > 1 and scored[1][0] >= best_score * 0.9:
            result.append(scored[1][1])
        return result

    def rerank_chunks_by_filename(
        self,
        query: str,
        chunks: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Boost chunks whose file_name matches query terms, then sort by score."""
        if not chunks:
            return chunks

        ranked: list[tuple[float, dict[str, Any]]] = []
        for chunk in chunks:
            meta = chunk.get("metadata") or {}
            file_name = meta.get("file_name") or ""
            base = float(chunk.get("score") or 0)
            boost = self.score_filename_relevance(query, file_name) * 0.2
            ranked.append((base + boost, chunk))

        ranked.sort(key=lambda x: x[0], reverse=True)
        out: list[dict[str, Any]] = []
        for score, chunk in ranked:
            updated = dict(chunk)
            updated["score"] = score
            out.append(updated)
        return out

    def build_inventory_context_chunks(
        self,
        documents: List[Dict[str, str]],
        total_chunks: int,
    ) -> List[Dict[str, Any]]:
        """Authoritative context for questions about indexed files (not chunk content)."""
        if not documents:
            return [
                {
                    "content": "The knowledge base is empty. No files are indexed.",
                    "score": 1.0,
                    "metadata": {
                        "file_name": "Knowledge base inventory",
                        "element_type": "inventory",
                    },
                }
            ]

        names = [d["file_name"] for d in documents]
        summary = (
            "Knowledge base inventory (complete list — use this for file counts):\n"
            f"- Total indexed files: {len(documents)}\n"
            f"- Total text chunks: {total_chunks}\n"
            f"- Every indexed file name: " + "; ".join(names)
        )
        chunks: List[Dict[str, Any]] = [
            {
                "content": summary,
                "score": 1.0,
                "metadata": {
                    "file_name": "Knowledge base inventory",
                    "element_type": "inventory",
                },
            }
        ]
        for doc in documents:
            chunks.append(
                {
                    "content": f"Indexed file: {doc['file_name']}",
                    "score": 1.0,
                    "metadata": {
                        "file_name": doc["file_name"],
                        "document_id": doc["document_id"],
                        "element_type": "inventory",
                    },
                }
            )
        return chunks

    @staticmethod
    def _filter_chunks_for_user(
        results: list[dict[str, Any]], owner_user_id: uuid.UUID | None
    ) -> list[dict[str, Any]]:
        if owner_user_id is None:
            return results
        uid = str(owner_user_id)
        return [
            r
            for r in results
            if (r.get("metadata") or {}).get("user_id") == uid
        ]

    async def search(
        self,
        query: str,
        limit: int = 5,
        min_score: float = 0.3,
        document_ids: list[str] | None = None,
        owner_user_id: uuid.UUID | None = None,
    ) -> List[Dict[str, Any]]:
        """Semantic search for relevant chunks.

        Uses query_embed() so models like nomic-embed-text apply the
        'search_query:' prefix automatically — giving better recall than
        plain embed() on the query side.

        When document_ids is set, results are limited to those library files
        (used for conversations opened from a specific document).
        """
        vector_service.ensure_collection()
        if not vector_service.collection_exists():
            return []

        query_vector = list(self.model.query_embed([query]))[0].tolist()

        query_filter = None
        if document_ids:
            query_filter = models.Filter(
                should=[
                    models.FieldCondition(
                        key="metadata.document_id",
                        match=models.MatchValue(value=doc_id),
                    )
                    for doc_id in document_ids
                ]
            )

        try:
            response = self.client.query_points(
                collection_name=self.collection_name,
                query=query_vector,
                query_filter=query_filter,
                limit=limit,
                with_payload=True,
                with_vectors=False,
                score_threshold=min_score,
            )
        except Exception as exc:
            if is_missing_collection_error(exc):
                return []
            raise

        results: list[dict[str, Any]] = []
        for res in response.points:
            meta = res.payload.get("metadata") or {}
            if res.id is not None:
                meta = {**meta, "chunk_id": str(res.id)}
            results.append(
                {
                    "content": res.payload.get("content"),
                    "score": res.score,
                    "metadata": meta,
                    "chunk_id": str(res.id) if res.id is not None else None,
                }
            )
        return self._filter_chunks_for_user(results, owner_user_id)

    def format_context_for_llm(self, search_result: List[Dict[str, Any]]) -> str:
        parts = []
        for i, res in enumerate(search_result):
            meta = dict(res.get("metadata") or {})
            content = res.get("content") or ""
            enrich_location_metadata(meta, content)

            element_type = meta.get("element_type")
            if element_type in ("routing_hint", "inventory"):
                parts.append(f"--- Context note ---\n{content}")
                continue

            source = meta.get("file_name", "Unknown")
            cite = meta.get("source_index") or (len(parts) + 1)
            location = format_location_label(meta)
            language = meta.get("language")

            label_parts = [f"Source [{cite}]: {source}", location]
            if meta.get("section_title"):
                label_parts.append(f'section "{meta["section_title"]}"')
            if language:
                label_parts.append(f"language: {language}")

            label = " · ".join(label_parts)
            parts.append(f"--- Context {cite} ({label}) ---\n{content}")

        return "\n\n".join(parts)

    def _list_indexed_documents_sync(self) -> list[dict[str, Any]]:
        now = time.monotonic()
        with self._indexed_docs_cache_lock:
            cached = self._indexed_docs_cache
            if cached and now - cached[0] < _INDEXED_DOCS_CACHE_TTL_SECONDS:
                return cached[1]

        vector_service.ensure_collection()
        if not vector_service.collection_exists():
            return []

        docs: dict[str, dict[str, Any]] = {}
        offset = None
        # Never block HTTP/auth behind a long embed. Prefer stale cache over "nothing indexed".
        if not vector_db_heavy_lock.acquire(timeout=0.4):
            with self._indexed_docs_cache_lock:
                if self._indexed_docs_cache:
                    return self._indexed_docs_cache[1]
            return []
        try:
            while True:
                try:
                    results, next_offset = self.client.scroll(
                        collection_name=self.collection_name,
                        limit=1000,
                        offset=offset,
                        with_payload=["metadata.document_id", "metadata.file_name"],
                        with_vectors=False,
                    )
                except Exception as exc:
                    if is_missing_collection_error(exc):
                        return []
                    raise
                for point in results:
                    meta = point.payload.get("metadata") or {}
                    doc_id = meta.get("document_id")
                    if not doc_id:
                        continue
                    if doc_id not in docs:
                        docs[doc_id] = {
                            "document_id": doc_id,
                            "file_name": meta.get("file_name", "unknown"),
                            "chunk_count": 0,
                        }
                    docs[doc_id]["chunk_count"] += 1
                if next_offset is None:
                    break
                offset = next_offset
        finally:
            vector_db_heavy_lock.release()

        result = list(docs.values())
        with self._indexed_docs_cache_lock:
            self._indexed_docs_cache = (time.monotonic(), result)
        return result

    async def list_indexed_documents(self):
        import asyncio

        return await asyncio.to_thread(self._list_indexed_documents_sync)

    def delete_document_by_id_sync(self, document_id: str):
        if not vector_service.collection_exists():
            return None
        try:
            return self.client.delete(
                collection_name=self.collection_name,
                points_selector=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="metadata.document_id",
                            match=models.MatchValue(value=document_id),
                        )
                    ]
                ),
            )
        except Exception as exc:
            if is_missing_collection_error(exc):
                return None
            raise

    async def delete_document_by_id(self, document_id: str):
        import asyncio

        return await asyncio.to_thread(self.delete_document_by_id_sync, document_id)


retrieval_service = RetrievalService()
