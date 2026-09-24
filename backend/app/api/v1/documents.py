import mimetypes
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from sqlmodel import select

from app.models.document_catalog import DocumentCatalog
from app.services.access_control import filter_documents_for_user, require_document_owned
from app.services.document_catalog_service import document_catalog_service
from app.services.document_storage_service import document_storage
from app.services.ingest_job_service import latest_jobs_for_user
from app.services.library_document_service import (
    add_catalog_chunk_counts,
    derive_index_status,
)
from app.services.retrieval_service import retrieval_service

router = APIRouter(prefix="/documents", tags=["Documents"])


class DocumentCollectionUpdate(BaseModel):
    collection: str = Field(min_length=1, max_length=64)


@router.get("/")
async def get_documents(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    indexed_list = await retrieval_service.list_indexed_documents()
    indexed_list = filter_documents_for_user(db, current_user, indexed_list)
    indexed_by_id = {d["document_id"]: d for d in indexed_list if d.get("document_id")}

    catalog_rows = db.exec(
        select(DocumentCatalog).where(DocumentCatalog.user_id == current_user.id)
    ).all()
    add_catalog_chunk_counts(indexed_by_id, catalog_rows)
    jobs_by_doc = latest_jobs_for_user(db, current_user.id)

    catalog_by_id = {row.document_id: row for row in catalog_rows}
    all_ids: set[str] = set(indexed_by_id) | set(catalog_by_id)

    merged: list[dict] = []
    for doc_id in all_ids:
        catalog = catalog_by_id.get(doc_id)
        indexed = indexed_by_id.get(doc_id)
        file_name = (
            (catalog.file_name if catalog else None)
            or (indexed.get("file_name") if indexed else None)
            or "unknown"
        )
        base = {
            "document_id": doc_id,
            "file_name": file_name,
            "chunk_count": (indexed or {}).get("chunk_count", 0),
        }
        if catalog:
            base["collection"] = catalog.collection
        merged.append(base)

    merged = document_catalog_service.enrich_documents(db, merged)
    enriched = []
    for doc in merged:
        doc_id = doc["document_id"]
        path = document_storage.find_path(doc_id)
        has_file = bool(path and path.is_file())
        media_type, _ = mimetypes.guess_type(doc["file_name"])
        uploaded_at = None
        if has_file and path:
            mtime = path.stat().st_mtime
            uploaded_at = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()

        index_status, index_error = derive_index_status(
            indexed=indexed_by_id.get(doc_id),
            job=jobs_by_doc.get(doc_id),
        )
        job = jobs_by_doc.get(doc_id)
        index_started_at = None
        ingest_status = None
        if job and index_status == "indexing":
            ingest_status = job.status
            # Only count time the worker has actually been running — not hours
            # sitting in the queue after upload or a server restart.
            if job.status == "processing" and job.started_at is not None:
                started = job.started_at
                if started.tzinfo is None:
                    started = started.replace(tzinfo=timezone.utc)
                index_started_at = started.isoformat()

        enriched.append(
            {
                **doc,
                "file_size": path.stat().st_size if has_file else None,
                "has_file": has_file,
                "media_type": media_type,
                "uploaded_at": uploaded_at,
                "index_status": index_status,
                "index_error": index_error,
                "index_started_at": index_started_at,
                "ingest_status": ingest_status,
            }
        )

    enriched.sort(key=lambda d: d.get("uploaded_at") or "", reverse=True)
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
