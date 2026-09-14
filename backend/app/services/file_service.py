import os
import tempfile
import threading
from pathlib import Path
from fastapi import UploadFile, HTTPException
import uuid

from app.core.config import settings

# Extensions that Docling handles (returns DoclingDocument)
_DOCLING_EXTENSIONS = {".pdf", ".docx", ".pptx", ".png", ".jpg", ".jpeg"}

# Extensions read directly as raw bytes (decoded later by chunking service)
_TEXT_EXTENSIONS = {".txt", ".md", ".puml", ".json"}

# Tabular formats (bytes, processed by pandas in chunking service)
_TABULAR_EXTENSIONS = {".csv", ".xlsx"}

# Source code — read as raw bytes, chunked with language-aware splitter
_CODE_EXTENSIONS = {
    ".py", ".pyw",
    ".js", ".jsx", ".mjs", ".cjs",
    ".ts", ".tsx",
    ".java",
    ".kt", ".kts",
    ".go",
    ".rs",
    ".c", ".h",
    ".cpp", ".cc", ".cxx", ".hpp", ".hxx",
    ".rb",
    ".php",
    ".swift",
    ".dart",
    ".sh", ".bash", ".zsh",
    ".sql",
    ".yaml", ".yml",
    ".toml",
    ".xml",
    ".html", ".htm",
    ".css", ".scss", ".sass",
    ".r",
    ".scala",
    ".lua",
    ".tf",          # Terraform
    ".dockerfile",  # Dockerfile (no extension variant)
    ".env",
    ".ini", ".cfg",
}

ALL_ALLOWED = _DOCLING_EXTENSIONS | _TEXT_EXTENSIONS | _TABULAR_EXTENSIONS | _CODE_EXTENSIONS


class FileService:
    def __init__(self):
        self._converter = None
        self.max_file_size = settings.STORAGE.MAX_UPLOAD_BYTES
        # Docling/OCR is not safe to run concurrently in one process.
        self._docling_lock = threading.Lock()

    def _get_converter(self):
        """Load Docling only when a file actually needs it (not on API startup)."""
        if self._converter is None:
            from docling.document_converter import DocumentConverter

            print("[ingest] loading Docling converter")
            self._converter = DocumentConverter()
        return self._converter

    async def validate_file(self, file: UploadFile):
        """Ensure file size and extension are acceptable."""
        size = file.size if file.size else 0
        if size and size > self.max_file_size:
            limit = self._max_size_label()
            raise HTTPException(status_code=413, detail=f"File too large (max {limit}).")

        ext = Path(file.filename).suffix.lower()
        # Allow files named 'Dockerfile' (no extension)
        if file.filename and file.filename.lower() == "dockerfile":
            return
        if ext not in ALL_ALLOWED:
            raise HTTPException(
                status_code=415,
                detail=f"Extension '{ext}' is not supported. "
                       f"Supported: documents, images, spreadsheets, and source code.",
            )

    def _max_size_label(self) -> str:
        gb = self.max_file_size / (1024**3)
        if gb >= 1 and gb == int(gb):
            return f"{int(gb)} GB"
        return f"{self.max_file_size / (1024**2):.0f} MB"

    def process_stored_file(
        self, path: Path, filename: str
    ) -> tuple[bytes | object, str]:
        """Convert an on-disk upload without duplicating bytes for Docling."""
        ext = Path(filename).suffix.lower()

        if ext in _DOCLING_EXTENSIONS:
            try:
                with self._docling_lock:
                    result = self._get_converter().convert(path)
                return result.document, "docling"
            except Exception as e:
                print(f"Docling conversion error for {filename}: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Document conversion failed: {e}"
                )

        content = path.read_bytes()
        return self.process_bytes(content, filename)

    async def process_file(self, file: UploadFile) -> tuple[bytes | object, str]:
        content = await file.read()
        return self.process_bytes(content, file.filename or "unnamed")

    def process_bytes(self, content: bytes, filename: str) -> tuple[bytes | object, str]:
        """
        Convert file bytes to either:
          - raw bytes  (text / tabular / source-code paths)
          - DoclingDocument (PDF, DOCX, PPTX, images)

        Safe to call from a worker thread. Returns (content, file_type) where
        file_type is one of: 'docling' | 'csv' | 'xlsx' | 'json' | 'text' | 'code'
        """
        ext = Path(filename).suffix.lower()

        # Tabular
        if ext == ".csv":
            return content, "csv"
        if ext == ".xlsx":
            return content, "xlsx"

        # JSON
        if ext == ".json":
            return content, "json"

        # Plain text / markup / PUML
        if ext in _TEXT_EXTENSIONS:
            return content, "text"

        # Source code
        if ext in _CODE_EXTENSIONS or filename.lower() == "dockerfile":
            return content, "code"

        # Docling path (PDF, DOCX, PPTX, images)
        safe_name = f"buildlens_{uuid.uuid4()}{ext}"
        temp_path = Path(tempfile.gettempdir()) / safe_name
        try:
            temp_path.write_bytes(content)
            with self._docling_lock:
                result = self._get_converter().convert(temp_path)
            return result.document, "docling"
        except Exception as e:
            print(f"Docling conversion error for {filename}: {e}")
            raise HTTPException(status_code=500, detail=f"Document conversion failed: {e}")
        finally:
            if temp_path.exists():
                os.remove(temp_path)


file_service = FileService()
