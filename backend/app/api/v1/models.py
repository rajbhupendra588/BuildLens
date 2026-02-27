import asyncio
from fastapi import APIRouter, Depends
from sqlmodel import Session
import httpx

from app.services.llm_service import llm_service
from app.services.settings_service import settings_service
from app.core.database import get_session

router = APIRouter(prefix="/models", tags=["Models"])

# Fallbacks used when API key is not configured or the remote call fails
_FALLBACK_OPENAI = [
    {"name": "gpt-4o", "provider": "openai"},
    {"name": "gpt-4o-mini", "provider": "openai"},
    {"name": "gpt-3.5-turbo", "provider": "openai"},
]

_FALLBACK_GEMINI = [
    {"name": "gemini-2.5-pro-preview-05-06", "provider": "gemini"},
    {"name": "gemini-2.5-flash-preview-04-17", "provider": "gemini"},
    {"name": "gemini-2.0-flash", "provider": "gemini"},
    {"name": "gemini-2.0-flash-lite", "provider": "gemini"},
    {"name": "gemini-1.5-pro", "provider": "gemini"},
    {"name": "gemini-1.5-flash", "provider": "gemini"},
    {"name": "gemini-1.5-flash-8b", "provider": "gemini"},
]

_FALLBACK_ANTHROPIC = [
    {"name": "claude-3-5-sonnet-20241022", "provider": "anthropic"},
    {"name": "claude-3-5-haiku-20241022", "provider": "anthropic"},
    {"name": "claude-3-haiku-20240307", "provider": "anthropic"},
]

_OPENAI_CHAT_PREFIXES = ("gpt-4", "gpt-3.5-turbo", "o1", "o3", "o4")


async def _fetch_openai_models(api_key: str | None) -> list[dict]:
    if not api_key:
        return _FALLBACK_OPENAI
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)
        models = await client.models.list()
        result = sorted(
            [
                {"name": m.id, "provider": "openai"}
                for m in models.data
                if m.id.startswith(_OPENAI_CHAT_PREFIXES) and "instruct" not in m.id
            ],
            key=lambda x: x["name"],
            reverse=True,
        )
        return result or _FALLBACK_OPENAI
    except Exception:
        return _FALLBACK_OPENAI


def _list_gemini_sync(api_key: str) -> list[dict]:
    """Blocking call — run inside a thread via asyncio.to_thread."""
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    return [
        {"name": m.name.removeprefix("models/"), "provider": "gemini"}
        for m in genai.list_models()
        if "generateContent" in m.supported_generation_methods and "gemini" in m.name
    ]


async def _fetch_gemini_models(api_key: str | None) -> list[dict]:
    if not api_key:
        return _FALLBACK_GEMINI
    try:
        models = await asyncio.to_thread(_list_gemini_sync, api_key)
        return sorted(models, key=lambda x: x["name"], reverse=True) or _FALLBACK_GEMINI
    except Exception:
        return _FALLBACK_GEMINI


async def _fetch_anthropic_models(api_key: str | None) -> list[dict]:
    if not api_key:
        return _FALLBACK_ANTHROPIC
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            )
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            return [{"name": m["id"], "provider": "anthropic"} for m in data] or _FALLBACK_ANTHROPIC
        return _FALLBACK_ANTHROPIC
    except Exception:
        return _FALLBACK_ANTHROPIC


@router.get("/")
async def list_models(db: Session = Depends(get_session)):
    openai_key = settings_service.get("openai_api_key", db)
    gemini_key = settings_service.get("gemini_api_key", db)
    anthropic_key = settings_service.get("anthropic_api_key", db)

    # All fetches run concurrently — total time = slowest provider, not the sum
    ollama_result, openai_result, gemini_result, anthropic_result = await asyncio.gather(
        llm_service.fetch_ollama_models(),
        _fetch_openai_models(openai_key),
        _fetch_gemini_models(gemini_key),
        _fetch_anthropic_models(anthropic_key),
    )

    return {
        "local": [{"name": m["name"], "provider": "ollama"} for m in ollama_result],
        "cloud": [*openai_result, *gemini_result, *anthropic_result],
    }
