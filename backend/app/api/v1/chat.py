from fastapi import APIRouter
from app.services.retrieval_service import retrieval_service
from app.services.llm_service import llm_service

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("/ask")
async def ask_question(question: str):
    context_chunks = await retrieval_service.search(question, limit=5)

    if not context_chunks:
        return {
            "answer": "Sorry, I couldn't find any relevant information.",
            "sources": []
        }

    answer = await llm_service.generate_answer(question, context_chunks)

    return {
        "answer": answer,
        "sources": [res["metadata"].get("file_name") for res in context_chunks]
    }