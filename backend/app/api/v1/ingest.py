from fastapi import APIRouter, UploadFile, File, Depends
from app.services.file_service import file_service
from app.services.chunking_service import chunking_service
from app.services.vector_service import vector_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    # Validate
    await file_service.validate_file(file)

    extracted_raw = await file_service.process_file(file)

    if file.filename.endswith('.csv'):
        final_text = chunking_service.process_csv_to_sentences(extracted_raw)
    elif file.filename.endswith(('.xlsx', '.json', '.txt', '.md', '.puml')):

        final_text = extracted_raw.decode("utf-8") if isinstance(extracted_raw, bytes) else str(extracted_raw)
    else:
        final_text = extracted_raw

    # Chunking
    chunks = chunking_service.split_content(final_text, file.filename)

    vector_service.upsert_chunks(chunks)
    return {
        "file_name": file.filename,
        "total_chunks": len(chunks),
        "chunks_preview": chunks[:5],
        "status": "success",
        "message": f"Successfully indexed {len(chunks)} chunnks into Vector DB"
    }