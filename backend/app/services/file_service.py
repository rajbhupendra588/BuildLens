import os
import json
from pathlib import Path
from docling.document_converter import DocumentConverter
from fastapi import UploadFile, HTTPException
import pandas as pd
import uuid

class FileService:
    def __init__(self):
        self.converter = DocumentConverter()
        self.max_file_size = 20 * 1024 * 1024 # 20MB
        self.allowed_extensions = {
            ".pdf", ".docx", ".pptx", ".png", ".jpg", ".jpeg", 
            ".puml", ".txt", ".md", ".json", ".csv", ".xlsx"
        }

    async def validate_file(self, file: UploadFile):
        """Ensure file is within size limits and not empty."""
        size = file.size if file.size else 0
        if size > self.max_file_size:
            raise HTTPException(status_code=403, detail="File too large (Max 20MB)")

        # Validate extensions
        ext = Path(file.filename).suffix.lower()
        if ext not in self.allowed_extensions:
            raise HTTPException(status_code=415, detail=f"Extension {ext} not supported")

    
    async def process_file(self, file: UploadFile) -> str:
        """Convert uploaded file to Markdown text."""
        ext = Path(file.filename).suffix.lower()
        content = await file.read()

        # Stardardize .puml and text files (read directly)
        if ext in {".csv", ".xlsx", ".json", ".txt", ".md", ".puml"}:
            return content

        # ASCII filename to avoid UnicodeEncodeError
        safe_filename = f"temp_{uuid.uuid4()}{ext}"
        temp_path = Path(safe_filename)

        try:
            with open(temp_path, "wb") as f:
                f.write(content)

            # Docling for PDF, DOCX, Images
            result = self.converter.convert(temp_path)
            return result.document

        except Exception as e:
            print(f"Error processing {file.filename}: {str(e)}")
            # raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
        finally:
            if temp_path.exists():
                os.remove(temp_path)

file_service = FileService()