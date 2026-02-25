import uuid
from fastapi import APIRouter, UploadFile, File
from app.services.file_service import file_service
from app.services.chunking_service import chunking_service
from app.services.vector_service import vector_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    await file_service.validate_file(file)

    # file_service now returns (content, file_type)
    raw_content, file_type = await file_service.process_file(file)

    # Convert tabular / structured bytes into plain text
    if file_type == "csv":
        final_content = chunking_service.process_csv(raw_content)
        file_type = "text"
    elif file_type == "xlsx":
        final_content = chunking_service.process_xlsx(raw_content)
        file_type = "text"
    elif file_type == "json":
        final_content = chunking_service.process_json(raw_content)
        file_type = "text"
    elif file_type in {"text", "code"}:
        # Decode bytes to string for text / source-code paths
        final_content = (
            raw_content.decode("utf-8", errors="ignore")
            if isinstance(raw_content, bytes)
            else str(raw_content)
        )
    else:
        # "docling" — pass DoclingDocument directly
        final_content = raw_content

    document_id = str(uuid.uuid4())

    chunks = chunking_service.split_content(
        final_content,
        file.filename,
        document_id,
        file_type=file_type,
    )

    vector_service.upsert_chunks(chunks)

    return {
        "document_id": document_id,
        "file_name": file.filename,
        "file_type": file_type,
        "total_chunks": len(chunks),
        "chunks_preview": chunks[:3],
        "status": "success",
        "message": f"Successfully indexed {len(chunks)} chunks into Vector DB",
    }
