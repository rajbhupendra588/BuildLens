from typing import List, Dict, Any
from app.core.config import settings
from app.services.vector_service import vector_service
from qdrant_client.models import Filter
from qdrant_client import models

class RetrievalService:
    def __init__(self):
        self.client = vector_service.client
        self.model = vector_service.model
        self.collection_name = settings.QDRANT.COLLECTION_NAME

    async def search(self, query: str, limit: int = 5, min_score: float = 0.3) -> List[Dict[str, Any]]:
        """Search for relevant chunks."""
        query_vector = list(self.model.embed([query]))[0].tolist()
        print("query_vector: ", query_vector)

        response = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            limit=limit,
            with_payload=True,
            with_vectors=False,
            score_threshold=min_score,
        )

        print("response: ", response)

        results = []
        for res in response.points:
            results.append({
                "content": res.payload.get("content"),
                "score": res.score,
                "metadata": res.payload.get("metadata")
            })

        return results


    def format_context_for_llm(self, search_result: List[Dict[str, Any]]) -> str:
        context_parts = []
        for i, res in enumerate(search_result):
            content = res["content"]
            source = res["metadata"].get("file_name", "Unknown Source")
            context_parts.append(f"--- Context {i+1} (Source: {source}) ---\n{content}")
        
        return "\n\n".join(context_parts)

    async def list_indexed_documents(self):
        results, _ = self.client.scroll(
            collection_name=self.collection_name,
            limit=10000,
            with_payload=True,
            with_vectors=False
        )

        docs = {}
        for point in results:
            meta = point.payload.get("metadata", {})
            doc_id = meta.get("document_id")
            if doc_id and doc_id not in docs:
                docs[doc_id] = meta.get("file_name", "unknown")

        return [{"document_id": k, "file_name": v} for k, v in docs.items()]

    async def delete_document_by_id(self, document_id: str):
        return self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.Filter(
                must=[
                    models.FieldCondition(
                        key="metadata.document_id",
                        match=models.MatchValue(value=document_id)
                    )
                ]
            )
        )

       
retrieval_service = RetrievalService()