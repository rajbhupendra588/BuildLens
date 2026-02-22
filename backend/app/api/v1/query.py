from fastapi import APIRouter, HTTPException
from app.services.retrieval_service import retrieval_service

router = APIRouter(prefix="/query", tags=["Retrieval"])

@router.get("/search")
async def search_documents(q: str):
    if not q:
        raise HTTPException(status_code=400, detail="Query string is required")

    relevant_chunks = await retrieval_service.search(q)

    return {
        "query": q,
        "count": len(relevant_chunks),
        "results": relevant_chunks
    }