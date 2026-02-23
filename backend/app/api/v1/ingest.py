from fastapi import APIRouter, UploadFile, File, Depends
from app.services.file_service import file_service
from app.services.chunking_service import chunking_service
from app.services.vector_service import vector_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    # Validate
    await file_service.validate_file(file)

    file_content = await file.read()

    if file.filename.endswith('.csv'):
        extracted_data = chunking_service.process_csv_to_sentences(file_content)
    else:
        extracted_data = await file_service.process_file(file)

    # Chunking
    chunks = chunking_service.split_content(extracted_data, file.filename)

    vector_service.upsert_chunks(chunks)
    return {
        "file_name": file.filename,
        "total_chunks": len(chunks),
        "chunks_preview": chunks[:5],
        "status": "success",
        "message": f"Successfully indexed {len(chunks)} chunnks into Vector DB"
    }