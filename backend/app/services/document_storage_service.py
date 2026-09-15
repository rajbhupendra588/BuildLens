from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import settings

_STREAM_CHUNK = lambda: settings.STORAGE.UPLOAD_STREAM_CHUNK_BYTES
_MAX_BYTES = lambda: settings.STORAGE.MAX_UPLOAD_BYTES


class DocumentStorageService:
    """Persists original uploaded bytes so images and files can be served to the UI."""

    def __init__(self) -> None:
        self.root = Path(settings.STORAGE.UPLOAD_DIR)
        self.root.mkdir(parents=True, exist_ok=True)

    def _target_path(self, document_id: str, filename: str) -> Path:
        ext = Path(filename).suffix.lower() or ".bin"
        return self.root / f"{document_id}{ext}"

    def save(self, document_id: str, filename: str, content: bytes) -> Path:
        path = self._target_path(document_id, filename)
        path.write_bytes(content)
        return path

    async def save_upload_stream(
        self,
        document_id: str,
        filename: str,
        upload: UploadFile,
    ) -> tuple[Path, int]:
        """Stream multipart body to disk — avoids holding large files in RAM."""
        path = self._target_path(document_id, filename)
        total = 0
        chunk_size = _STREAM_CHUNK()
        max_bytes = _MAX_BYTES()

        write_buffer = max(chunk_size, 1024 * 1024)
        try:
            with path.open("wb", buffering=write_buffer) as out:
                while True:
                    chunk = await upload.read(chunk_size)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise HTTPException(
                            status_code=413,
                            detail=f"File too large (max {_max_gb_label()}).",
                        )
                    out.write(chunk)
        except Exception:
            if path.exists():
                path.unlink(missing_ok=True)
            raise

        if total == 0:
            path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Empty upload.")

        return path, total

    def find_path(self, document_id: str) -> Path | None:
        for path in self.root.glob(f"{document_id}.*"):
            if path.is_file():
                return path
        return None

    def exists(self, document_id: str) -> bool:
        return self.find_path(document_id) is not None

    def delete(self, document_id: str) -> None:
        for path in self.root.glob(f"{document_id}.*"):
            path.unlink(missing_ok=True)


def _max_gb_label() -> str:
    gb = settings.STORAGE.MAX_UPLOAD_BYTES / (1024**3)
    if gb >= 1 and gb == int(gb):
        return f"{int(gb)} GB"
    return f"{settings.STORAGE.MAX_UPLOAD_BYTES / (1024**2):.0f} MB"


document_storage = DocumentStorageService()
