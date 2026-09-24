"""Hard limits during full library indexing (fail fast with a clear message)."""


class IngestLimitError(Exception):
    """User-facing ingest rejected before heavy CPU/RAM work."""


def check_chunk_count(count: int, *, file_name: str) -> None:
    from app.core.config import settings

    limit = settings.INGEST.MAX_INDEX_CHUNKS
    if limit <= 0 or count <= limit:
        return
    raise IngestLimitError(
        f"{file_name!r} would produce {count:,} index chunks (limit {limit:,}). "
        "Split the file into smaller parts or remove extra rows/columns, then upload again."
    )
