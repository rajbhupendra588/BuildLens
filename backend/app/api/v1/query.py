from fastapi import APIRouter, Depends, HTTPException
from app.core.deps import get_current_user
from app.models.user import User
from app.services.retrieval_service import retrieval_service

router = APIRouter(prefix="/query", tags=["Retrieval"])


@router.get("/search")
async def search_documents(
    q: str,
    current_user: User = Depends(get_current_user),
):
    if not q:
        raise HTTPException(status_code=400, detail="Query string is required")

    relevant_chunks = await retrieval_service.search(
        q, owner_user_id=current_user.id
    )

    return {
        "query": q,
        "count": len(relevant_chunks),
        "results": relevant_chunks,
    }
