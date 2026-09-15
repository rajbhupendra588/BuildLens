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

# FastEmbed reports these sizes; keep a table so an empty Qdrant can be
# initialized without downloading the embedding model at API startup.
_KNOWN_EMBED_SIZES: dict[str, int] = {
    "nomic-ai/nomic-embed-text-v1.5": 768,
    "sentence-transformers/all-MiniLM-L6-v2": 384,
    "BAAI/bge-small-en-v1.5": 384,
}


def is_missing_collection_error(exc: BaseException) -> bool:
    """True when Qdrant rejected a call because the target collection is gone."""
    text = str(exc).lower()
    if "collection" in text and (
        "doesn't exist" in text or "does not exist" in text or "not found" in text
    ):
        return True
    content = getattr(exc, "content", None)
    if isinstance(content, (bytes, bytearray)):
        lowered = content.decode("utf-8", errors="ignore").lower()
        if "collection" in lowered and "exist" in lowered:
            return True
    return False


class VectorService:
    _model = None

    def __init__(self):
        self.client = QdrantClient(host=settings.QDRANT.HOST, port=settings.QDRANT.PORT)
        self.collection_name = settings.QDRANT.COLLECTION_NAME
        try:
            self.ensure_collection()
        except Exception as exc:
            print(
                f"[qdrant] collection {self.collection_name!r} not ready at startup: {exc}"
            )

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

    def _vector_size(self) -> int:
        known = _KNOWN_EMBED_SIZES.get(settings.EMBED_MODEL)
        if known:
            return known
        return int(self.model.embedding_size)

    def collection_exists(self) -> bool:
        try:
            return bool(self.client.collection_exists(self.collection_name))
        except Exception as exc:
            if is_missing_collection_error(exc):
                return False
            raise

    def ensure_collection(self) -> None:
        """Create the collection if missing, without loading FastEmbed when possible."""
        if self.collection_exists():
            return
        try:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self._vector_size(),
                    distance=Distance.COSINE,
                ),
            )
        except Exception as exc:
            if self.collection_exists() or "already exists" in str(exc).lower():
                return
            raise

    def _ensure_collection(self):
        self.ensure_collection()

    def _warn_if_size_mismatch(self):
        if not self.collection_exists():
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

    def upsert_chunks(
        self,
        chunks: List[Dict[str, Any]],
        batch_size: int | None = None,
    ):
        """Embed and upsert chunks in batches (size from settings by default)."""
        self.ensure_collection()
        if batch_size is None:
            batch_size = settings.INGEST.EMBED_BATCH_SIZE
        batch_size = max(1, min(batch_size, 64))
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
        try:
            self.ensure_collection()
            if not self.collection_exists():
                return {"total_chunks": 0, "total_files": 0}

            total_chunks = self.client.count(collection_name=self.collection_name).count
        except Exception as exc:
            if is_missing_collection_error(exc):
                return {"total_chunks": 0, "total_files": 0}
            raise

        # Use scroll with offset pagination to avoid loading all points into memory
        doc_ids: set[str] = set()
        offset = None
        while True:
            try:
                results, next_offset = self.client.scroll(
                    collection_name=self.collection_name,
                    limit=1000,
                    offset=offset,
                    with_payload=["metadata.document_id"],
                    with_vectors=False,
                )
            except Exception as exc:
                if is_missing_collection_error(exc):
                    return {"total_chunks": total_chunks, "total_files": len(doc_ids)}
                raise
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
        if self.collection_exists():
            self.client.delete_collection(self.collection_name)
        self.ensure_collection()


vector_service = VectorService()
