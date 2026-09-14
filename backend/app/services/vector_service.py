import os
from pathlib import Path

from app.core.config import settings
from typing import Any, Dict, List
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

# Persist across restarts (Docker volume). Default /tmp re-downloads ~520MB each time.
FASTEMBED_CACHE_DIR = Path(
    os.environ.get("FASTEMBED_CACHE_DIR", "/app/.cache/fastembed")
)


class VectorService:
    _model = None

    def __init__(self):
        self.client = QdrantClient(host=settings.QDRANT.HOST, port=settings.QDRANT.PORT)
        self.collection_name = settings.QDRANT.COLLECTION_NAME
        self._ensure_collection()

    @property
    def model(self):
        if VectorService._model is None:
            from fastembed import TextEmbedding

            FASTEMBED_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            print(
                f"[embed] loading {settings.EMBED_MODEL} "
                f"(cache={FASTEMBED_CACHE_DIR})"
            )
            VectorService._model = TextEmbedding(
                model_name=settings.EMBED_MODEL,
                cache_dir=str(FASTEMBED_CACHE_DIR),
                threads=1,
                lazy_load=True,
            )
            self._warn_if_size_mismatch()
        return VectorService._model

    def _ensure_collection(self):
        """Create collection if missing. Do not load the embed model just to check."""
        if self.client.collection_exists(self.collection_name):
            return
        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(
                size=self.model.embedding_size,
                distance=Distance.COSINE,
            ),
        )

    def _warn_if_size_mismatch(self):
        if not self.client.collection_exists(self.collection_name):
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

    def upsert_chunks(self, chunks: List[Dict[str, Any]], batch_size: int = 8):
        """Embed and upsert chunks in small batches to avoid OOM in Docker."""
        total = len(chunks)
        for start in range(0, len(chunks), batch_size):
            done = min(start + batch_size, total)
            if start == 0 or done == total or done % 80 == 0:
                print(f"[ingest] embedding {done}/{total} chunks")
            batch = chunks[start : start + batch_size]
            texts = [c["content"] for c in batch]
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
                for i, chunk in enumerate(batch)
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
