from fastapi import APIRouter, UploadFile, File, Depends
from app.services.file_service import file_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    # Validate
    await file_service.validate_file(file)

    # Parse to Markdown
    markdown_content = await file_service.process_file(file)

    # TODO: Chunking & Embedding
    return {
        "file_name": file.filename,
        "content_preview": markdown_content[:500],
        "length": len(markdown_content)
    }