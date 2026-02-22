from app.core.config import settings
import uuid
from typing import List, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from fastembed import TextEmbedding

class VectorService:
    def __init__(self):
        self.client = QdrantClient(host=settings.QDRANT.HOST, port=settings.QDRANT.PORT)
        self.model = TextEmbedding(model_name=settings.EMBED_MODEL)
        self.collection_name = settings.QDRANT.COLLECTION_NAME
        self._ensure_collection()

    def _ensure_collection(self):
        """Create collection if not exists."""
        if not self.client.collection_exists(self.collection_name):
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self.model.embedding_size,
                    distance=Distance.COSINE
                )
            )

    def upsert_chunks(self, chunks: List[Dict[str, Any]]):
        """Generate embeddings and upsert to Qdrant."""
        texts = [c["content"] for c in chunks]
        embeddings = list(self.model.embed(texts))

        points = []
        for i, chunk in enumerate(chunks):
            points.append(
                PointStruct(
                    id=chunk["id"],
                    vector=embeddings[i].tolist(),
                    payload={
                        "content": chunk["content"],
                        "metadata": chunk["metadata"]
                    }
                )
            )
        
        self.client.upsert(
            collection_name=self.collection_name,
            points=points
        )
        return True

vector_service = VectorService()