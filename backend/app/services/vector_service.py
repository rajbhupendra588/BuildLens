from app.core.config import settings
import uuid
from typing import List, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from fastembed import TextEmbedding


class VectorService:
    _model: TextEmbedding | None = None

    def __init__(self):
        self.client = QdrantClient(host=settings.QDRANT.HOST, port=settings.QDRANT.PORT)
        self.collection_name = settings.QDRANT.COLLECTION_NAME

        if VectorService._model is None:
            VectorService._model = TextEmbedding(model_name=settings.EMBED_MODEL)

        self.model = VectorService._model
        self._ensure_collection()

    def _ensure_collection(self):
        """Create collection if it does not exist.
        If it already exists but has a different vector size (e.g. after
        switching the embedding model), log a clear warning instead of
        silently breaking — user must clear the DB from Settings → Storage.
        """
        if not self.client.collection_exists(self.collection_name):
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self.model.embedding_size,
                    distance=Distance.COSINE,
                ),
            )
            return

        info = self.client.get_collection(self.collection_name)
        existing_size = info.config.params.vectors.size
        if existing_size != self.model.embedding_size:
            print(
                f"\n{'='*60}\n"
                f"WARNING: Vector size mismatch!\n"
                f"  Collection '{self.collection_name}' has {existing_size}-dim vectors.\n"
                f"  Current model '{settings.EMBED_MODEL}' produces {self.model.embedding_size}-dim vectors.\n"
                f"  Go to Settings → Storage → Clear Vector DB, then re-upload your documents.\n"
                f"{'='*60}\n"
            )

    def upsert_chunks(self, chunks: List[Dict[str, Any]]):
        """Embed and upsert chunks. Uses embed() which adds document prefix for nomic."""
        texts = [c["content"] for c in chunks]
        embeddings = list(self.model.embed(texts))

        points = [
            PointStruct(
                id=chunk["id"],
                vector=embeddings[i].tolist(),
                payload={
                    "content": chunk["content"],
                    "metadata": chunk["metadata"],
                },
            )
            for i, chunk in enumerate(chunks)
        ]

        self.client.upsert(collection_name=self.collection_name, points=points)
        return True

    def get_stats(self) -> dict:
        """Return total chunks and unique document count."""
        total_chunks = self.client.count(collection_name=self.collection_name).count

        # Use scroll with offset pagination to avoid loading all points into memory
        doc_ids: set[str] = set()
        offset = None
        while True:
            results, next_offset = self.client.scroll(
                collection_name=self.collection_name,
                limit=1000,
                offset=offset,
                with_payload=["metadata.document_id"],
                with_vectors=False,
            )
            for point in results:
                doc_id = (point.payload.get("metadata") or {}).get("document_id")
                if doc_id:
                    doc_ids.add(doc_id)
            if next_offset is None:
                break
            offset = next_offset

        return {"total_chunks": total_chunks, "total_files": len(doc_ids)}

    def clear_all(self):
        """Delete and recreate the collection (removes all vectors)."""
        self.client.delete_collection(self.collection_name)
        self._ensure_collection()


vector_service = VectorService()
