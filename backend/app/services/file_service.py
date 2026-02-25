import os
import tempfile
from pathlib import Path
from docling.document_converter import DocumentConverter
from fastapi import UploadFile, HTTPException
import uuid

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
        self.converter = DocumentConverter()
        self.max_file_size = 20 * 1024 * 1024  # 20 MB

    async def validate_file(self, file: UploadFile):
        """Ensure file size and extension are acceptable."""
        size = file.size if file.size else 0
        if size > self.max_file_size:
            raise HTTPException(status_code=403, detail="File too large (max 20 MB)")

        ext = Path(file.filename).suffix.lower()
        # Allow files named 'Dockerfile' (no extension)
        if file.filename.lower() == "dockerfile":
            return
        if ext not in ALL_ALLOWED:
            raise HTTPException(
                status_code=415,
                detail=f"Extension '{ext}' is not supported. "
                       f"Supported: documents, images, spreadsheets, and source code.",
            )

    async def process_file(self, file: UploadFile) -> tuple[bytes | object, str]:
        """
        Convert an uploaded file to either:
          - raw bytes  (text / tabular / source-code paths)
          - DoclingDocument (PDF, DOCX, PPTX, images)

        Returns (content, file_type) where file_type is one of:
          'docling' | 'csv' | 'xlsx' | 'json' | 'text' | 'code'
        """
        ext = Path(file.filename).suffix.lower()
        content = await file.read()

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
        if ext in _CODE_EXTENSIONS or file.filename.lower() == "dockerfile":
            return content, "code"

        # Docling path (PDF, DOCX, PPTX, images)
        safe_name = f"docrag_{uuid.uuid4()}{ext}"
        temp_path = Path(tempfile.gettempdir()) / safe_name
        try:
            temp_path.write_bytes(content)
            result = self.converter.convert(temp_path)
            return result.document, "docling"
        except Exception as e:
            print(f"Docling conversion error for {file.filename}: {e}")
            raise HTTPException(status_code=500, detail=f"Document conversion failed: {e}")
        finally:
            if temp_path.exists():
                os.remove(temp_path)


file_service = FileService()
