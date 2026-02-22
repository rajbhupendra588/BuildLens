import os
from pathlib import Path
from docling.document_converter import DocumentConverter
from fastapi import UploadFile, HTTPException

class FileService:
    def __init__(self):
        self.converter = DocumentConverter()
        self.max_file_size = 20 * 1024 * 1024 # 20MB

    async def validate_file(self, file: UploadFile):
        """Ensure file is within size limits and not empty."""
        size = file.size if file.size else 0
        if size > self.max_file_size:
            raise HTTPException(status_code=403, detail="File too large (Max 20MB)")

        # Validate extensions
        ext = Path(file.filename).suffix.lower()
        allowed = {".pdf", "docx", ".pptx", ".png", ".jpg", ".jpeg", ".puml", ".txt", ".md" }
        if ext not in allowed:
            raise HTTPException(status_code=415, detail=f"Extension {ext} not supported")

    
    async def process_file(self, file: UploadFile) -> str:
        """Convert uploaded file to Markdown text."""
        ext = Path(file.filename).suffix.lower()

        # Stardardize .puml and text files (read directly)
        if ext in {".puml", ".txt", ".md"}:
            content = await file.read()
            return content.decode("utf-8")

        # Use Docling for complex formats (PDF, DOCX, Images)
        temp_path = Path(f"temp_{file.filename}")
        try:
            with open(temp_path, "wb") as f:
                f.write(await file.read())

            result = self.converter.convert(temp_path)
            return result.document.export_to_markdown()

        finally:
            if temp_path.exists():
                os.remove(temp_path)

file_service = FileService()