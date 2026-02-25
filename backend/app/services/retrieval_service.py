from typing import List, Dict, Any
from app.core.config import settings
from app.services.vector_service import vector_service
from qdrant_client import models


class RetrievalService:
    def __init__(self):
        self.client = vector_service.client
        self.model = vector_service.model
        self.collection_name = settings.QDRANT.COLLECTION_NAME

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

    async def list_indexed_documents(self):
        docs: dict[str, str] = {}
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
                if doc_id and doc_id not in docs:
                    docs[doc_id] = meta.get("file_name", "unknown")
            if next_offset is None:
                break
            offset = next_offset

        return [{"document_id": k, "file_name": v} for k, v in docs.items()]

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
