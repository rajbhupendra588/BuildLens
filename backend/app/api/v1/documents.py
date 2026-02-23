from fastapi import APIRouter, HTTPException
from app.services.retrieval_service import retrieval_service

router = APIRouter(prefix="/documents", tags=["Documents"])

@router.get("/")
async def get_documents():
    docs = await retrieval_service.list_indexed_documents()
    return {"documents": docs}


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    try:
        await retrieval_service.delete_document_by_id(document_id)
        return {"message": f"Document {document_id} removed from Vector DB"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))