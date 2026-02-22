from typing import List, Dict, Any
from app.core.config import settings
from app.services.vector_service import vector_service
from qdrant_client.models import Filter

class RetrievalService:
    def __init__(self):
        self.client = vector_service.client
        self.model = vector_service.model
        self.collection_name = settings.QDRANT.COLLECTION_NAME

    async def search(self, query: str, limit: int = 5, min_score: float = 0.2) -> List[Dict[str, Any]]:
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

       
retrieval_service = RetrievalService()