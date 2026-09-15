import mimetypes
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.services.access_control import filter_documents_for_user, require_document_owned
from app.services.document_catalog_service import document_catalog_service
from app.services.document_storage_service import document_storage
from app.services.retrieval_service import retrieval_service

router = APIRouter(prefix="/documents", tags=["Documents"])


class DocumentCollectionUpdate(BaseModel):
    collection: str = Field(min_length=1, max_length=64)


@router.get("/")
async def get_documents(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    docs = await retrieval_service.list_indexed_documents()
    docs = filter_documents_for_user(db, current_user, docs)
    docs = document_catalog_service.enrich_documents(db, docs)
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


@router.patch("/{document_id}/collection")
async def update_document_collection(
    document_id: str,
    payload: DocumentCollectionUpdate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    require_document_owned(db, current_user, document_id)
    row = document_catalog_service.set_collection(
        db, document_id, payload.collection.strip()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found in catalog")
    return {
        "document_id": row.document_id,
        "file_name": row.file_name,
        "collection": row.collection,
    }


@router.get("/{document_id}/file")
async def get_document_file(
    document_id: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    require_document_owned(db, current_user, document_id)
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
        content_disposition_type="inline",
    )


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    require_document_owned(db, current_user, document_id)
    try:
        await retrieval_service.delete_document_by_id(document_id)
        document_storage.delete(document_id)
        document_catalog_service.delete(db, document_id)
        return {"message": f"Document {document_id} removed from Vector DB"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
