import re
from typing import List, Dict, Any
from app.core.config import settings
from app.services.vector_service import vector_service
from qdrant_client import models

# Meta-questions about the KB itself (file count, list uploads) — not document content.
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


class RetrievalService:
    def __init__(self):
        self.client = vector_service.client
        self.collection_name = settings.QDRANT.COLLECTION_NAME

    @property
    def model(self):
        return vector_service.model

    def is_knowledge_base_inventory_query(self, query: str) -> bool:
        return bool(_INVENTORY_QUERY.search(query.strip()))

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

    async def search(self, query: str, limit: int = 5, min_score: float = 0.3) -> List[Dict[str, Any]]:
        """Semantic search for relevant chunks.

        Uses query_embed() so models like nomic-embed-text apply the
        'search_query:' prefix automatically — giving better recall than
        plain embed() on the query side.
        """
        query_vector = list(self.model.query_embed([query]))[0].tolist()

        response = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            limit=limit,
            with_payload=True,
            with_vectors=False,
            score_threshold=min_score,
        )

        return [
            {
                "content": res.payload.get("content"),
                "score": res.score,
                "metadata": res.payload.get("metadata"),
            }
            for res in response.points
        ]

    def format_context_for_llm(self, search_result: List[Dict[str, Any]]) -> str:
        parts = []
        for i, res in enumerate(search_result):
            meta = res.get("metadata") or {}
            source = meta.get("file_name", "Unknown")
            page = meta.get("page_number")
            section = meta.get("section_title")
            language = meta.get("language")

            label_parts = [f"Source: {source}"]
            if page:
                label_parts.append(f"page {page}")
            if section:
                label_parts.append(f'section "{section}"')
            if language:
                label_parts.append(f"language: {language}")

            label = ", ".join(label_parts)
            parts.append(f"--- Context {i + 1} ({label}) ---\n{res['content']}")

        return "\n\n".join(parts)

    def _list_indexed_documents_sync(self) -> list[dict[str, Any]]:
        docs: dict[str, dict[str, Any]] = {}
        offset = None
        while True:
            results, next_offset = self.client.scroll(
                collection_name=self.collection_name,
                limit=1000,
                offset=offset,
                with_payload=["metadata.document_id", "metadata.file_name"],
                with_vectors=False,
            )
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

        return list(docs.values())

    async def list_indexed_documents(self):
        import asyncio

        return await asyncio.to_thread(self._list_indexed_documents_sync)

    async def delete_document_by_id(self, document_id: str):
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


retrieval_service = RetrievalService()
