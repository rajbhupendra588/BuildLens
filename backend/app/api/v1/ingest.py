from fastapi import APIRouter, UploadFile, File, Depends
from app.services.file_service import file_service
from app.services.chunking_service import chunking_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    # Validate
    await file_service.validate_file(file)

    # Parse to Markdown
    extracted_data = await file_service.process_file(file)

    # Chunking
    chunks = chunking_service.split_content(extracted_data, file.filename)

    # TODO: Embedding
    return {
        "file_name": file.filename,
        "total_chunks": len(chunks),
        "chunks_preview": chunks[:5]
    }