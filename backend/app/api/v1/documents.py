import mimetypes
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.document_storage_service import document_storage
from app.services.retrieval_service import retrieval_service

router = APIRouter(prefix="/documents", tags=["Documents"])

@router.get("/")
async def get_documents():
    docs = await retrieval_service.list_indexed_documents()
    enriched = []
    for doc in docs:
        path = document_storage.find_path(doc["document_id"])
        has_file = bool(path and path.is_file())
        media_type, _ = mimetypes.guess_type(doc["file_name"])
        uploaded_at = None
        if has_file and path:
            mtime = path.stat().st_mtime
            uploaded_at = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()

        enriched.append(
            {
                **doc,
                "file_size": path.stat().st_size if has_file else None,
                "has_file": has_file,
                "media_type": media_type,
                "uploaded_at": uploaded_at,
            }
        )
    return {"documents": enriched}


@router.get("/{document_id}/file")
async def get_document_file(document_id: str):
    path = document_storage.find_path(document_id)
    if not path or not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Original file not available. Re-upload the document to enable preview.",
        )

    media_type, _ = mimetypes.guess_type(path.name)
    return FileResponse(
        path,
        media_type=media_type or "application/octet-stream",
        filename=path.name,
    )


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    try:
        await retrieval_service.delete_document_by_id(document_id)
        document_storage.delete(document_id)
        return {"message": f"Document {document_id} removed from Vector DB"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))