from fastapi import APIRouter
from app.services.llm_service import llm_service

router = APIRouter(prefix="/models", tags=["Models"])

@router.get("/")
async def list_models():
    ollama_tags = await llm_service.fetch_ollama_models()

    cloud_models = [
        {"name": "gpt-4o", "provider": "openai"},
        {"name": "gpt-4o-mini", "provider": "openai"},
        {"name": "gpt-3.5-turbo", "provider": "openai"},
        {"name": "gemini-2.5-flash", "provider": "gemini"},
        {"name": "gemini-2.5-pro", "provider": "gemini"},
        {"name": "gemini-2.0-flash", "provider": "gemini"},
        {"name": "claude-3-5-sonnet-20241022", "provider": "anthropic"},
        {"name": "claude-3-5-haiku-20241022", "provider": "anthropic"},
        {"name": "claude-3-haiku-20240307", "provider": "anthropic"},
    ]

    return {
        "local": [{"name": m["name"], "provider": "ollama"} for m in ollama_tags],
        "cloud": cloud_models
    }
