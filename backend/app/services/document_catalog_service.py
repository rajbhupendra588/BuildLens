from __future__ import annotations

from datetime import datetime
import uuid

from sqlmodel import Session, select

from app.models.document_catalog import DocumentCatalog
from app.services.collection_classifier import classify_collection, scope_to_collection


class DocumentCatalogService:
    def upsert(
        self,
        db: Session,
        document_id: str,
        file_name: str,
        collection: str | None = None,
        user_id: uuid.UUID | None = None,
    ) -> DocumentCatalog:
        row = db.get(DocumentCatalog, document_id)
        resolved = collection or classify_collection(file_name)
        now = datetime.utcnow()
        if row:
            row.file_name = file_name
            row.collection = resolved
            if user_id is not None:
                row.user_id = user_id
            row.updated_at = now
        else:
            row = DocumentCatalog(
                document_id=document_id,
                file_name=file_name,
                collection=resolved,
                user_id=user_id,
                updated_at=now,
            )
            db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def get(self, db: Session, document_id: str) -> DocumentCatalog | None:
        return db.get(DocumentCatalog, document_id)

    def delete(self, db: Session, document_id: str) -> None:
        row = db.get(DocumentCatalog, document_id)
        if row:
            db.delete(row)
            db.commit()

    def count_for_user(self, db: Session, user_id: uuid.UUID) -> int:
        rows = db.exec(
            select(DocumentCatalog).where(DocumentCatalog.user_id == user_id)
        ).all()
        return len(rows)

    def collections_for_ids(
        self, db: Session, document_ids: list[str]
    ) -> dict[str, str]:
        if not document_ids:
            return {}
        statement = select(DocumentCatalog).where(
            DocumentCatalog.document_id.in_(document_ids)
        )
        rows = db.exec(statement).all()
        return {r.document_id: r.collection for r in rows}

    def filter_documents_by_scope(
        self,
        db: Session,
        documents: list[dict],
        scope_id: str | None,
    ) -> list[dict]:
        target = scope_to_collection(scope_id)
        if not target:
            return documents
        ids = [d.get("document_id") for d in documents if d.get("document_id")]
        mapping = self.collections_for_ids(db, ids)
        filtered: list[dict] = []
        for doc in documents:
            doc_id = doc.get("document_id")
            if not doc_id:
                continue
            collection = mapping.get(doc_id)
            if collection is None:
                collection = classify_collection(doc.get("file_name", ""))
                self.upsert(db, doc_id, doc.get("file_name", "unknown"), collection)
            if collection == target:
                filtered.append(doc)
        return filtered

    def set_collection(
        self, db: Session, document_id: str, collection: str
    ) -> DocumentCatalog | None:
        row = db.get(DocumentCatalog, document_id)
        if not row:
            return None
        row.collection = collection
        row.updated_at = datetime.utcnow()
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def enrich_documents(self, db: Session, documents: list[dict]) -> list[dict]:
        if not documents:
            return documents
        ids = [d["document_id"] for d in documents if d.get("document_id")]
        mapping = self.collections_for_ids(db, ids)
        enriched: list[dict] = []
        for doc in documents:
            doc_id = doc.get("document_id")
            file_name = doc.get("file_name", "unknown")
            collection = mapping.get(doc_id)
            if collection is None and doc_id:
                collection = classify_collection(file_name)
                self.upsert(db, doc_id, file_name, collection)
            enriched.append({**doc, "collection": collection or "general"})
        return enriched


document_catalog_service = DocumentCatalogService()
