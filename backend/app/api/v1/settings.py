from fastapi import APIRouter, Depends
from sqlmodel import Session
from pydantic import BaseModel
from typing import Optional
import httpx

from app.core.config import settings as app_settings
from app.core.database import get_session
from app.services.settings_service import settings_service



router = APIRouter(prefix="/settings", tags=["Settings"])

# Keys that contain sensitive API keys — returned masked if set
_SENSITIVE_KEYS = {
    "openai_api_key",
    "anthropic_api_key",
    "gemini_api_key",
    "openrouter_api_key",
    "zai_api_key",
    "moonshot_api_key",
    "minimax_api_key",
}


class SettingsUpdate(BaseModel):
    settings: dict[str, Optional[str]]


class TestConnectionRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class TestConnectionResponse(BaseModel):
    success: bool
    message: str
    saved: bool = False


@router.get("")
async def get_settings(db: Session = Depends(get_session)):
    """Return all settings; mask API keys if set."""
    raw = settings_service.get_all(db)

    # Apply environment defaults for values not yet saved in DB
    if "ollama_base_url" not in raw:
        raw["ollama_base_url"] = app_settings.LLM.OLLAMA_BASE_URL

    # If a sensitive key is missing from DB but is set via env var, surface it as masked
    # _ENV_SENSITIVE = {
    #     "openai_api_key": app_settings.LLM.OPENAI_API_KEY,
    #     "gemini_api_key": app_settings.LLM.GEMINI_API_KEY,
    #     "anthropic_api_key": app_settings.LLM.ANTHROPIC_API_KEY,
    # }
    # for key, env_val in _ENV_SENSITIVE.items():
    #     if key not in raw and env_val:
    #         raw[key] = env_val

    result = {}
    for key, value in raw.items():
        if key in _SENSITIVE_KEYS:
            result[key] = "****" if value else None
        else:
            result[key] = value
    return result


@router.put("")
async def update_settings(body: SettingsUpdate, db: Session = Depends(get_session)):
    """Update one or more settings keys."""
    for key, value in body.settings.items():
        # Skip masked values that were not changed by the user
        if value == "****":
            continue
        settings_service.set(key, value, db)
    return {"message": "Settings updated"}


async def _verify_openrouter_key(
    api_key: Optional[str], db: Session
) -> TestConnectionResponse:
    """Confirm the key with OpenRouter, store it, then try a short reply."""
    from app.services.llm_service import llm_service

    key = (api_key or "").strip()
    if not key:
        key = (settings_service.get("openrouter_api_key", db) or "").strip()
    if not key:
        return TestConnectionResponse(
            success=False,
            message="Enter an OpenRouter API key.",
        )

    async with httpx.AsyncClient(timeout=15.0) as client:
        key_resp = await client.get(
            "https://openrouter.ai/api/v1/key",
            headers={"Authorization": f"Bearer {key}"},
        )
    if key_resp.status_code != 200:
        return TestConnectionResponse(
            success=False,
            message="OpenRouter rejected this API key.",
        )

    settings_service.set("openrouter_api_key", key, db)
    try:
        await llm_service.generate_text(
            "Reply with the single word ok.",
            "Reply with one word.",
            "openrouter",
            "inclusionai/ling-3.0-flash-fin",
            api_key=key,
            max_tokens=32,
        )
    except Exception as exc:
        return TestConnectionResponse(
            success=False,
            saved=True,
            message=str(exc),
        )
    return TestConnectionResponse(
        success=True,
        saved=True,
        message="OpenRouter key saved. This provider is ready for chat.",
    )


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    body: TestConnectionRequest,
    db: Session = Depends(get_session),
):
    """Test connectivity to a provider using the provided credentials."""
    provider = body.provider.lower()
    api_key = (body.api_key or "").strip() or None
    base_url = body.base_url

    try:
        if provider == "ollama":
            url = (base_url or app_settings.LLM.OLLAMA_BASE_URL).rstrip("/")
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{url}/api/tags")
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                return TestConnectionResponse(
                    success=True,
                    message=f"Connected. {len(models)} model(s) available."
                )
            return TestConnectionResponse(success=False, message=f"HTTP {resp.status_code}")

        elif provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key)
            models = await client.models.list()
            count = len(list(models))
            return TestConnectionResponse(success=True, message=f"Connected. {count} model(s) available.")

        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            models = list(genai.list_models())
            return TestConnectionResponse(success=True, message=f"Connected. {len(models)} model(s) available.")

        elif provider == "anthropic":
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": api_key or "", "anthropic-version": "2023-06-01"}
                )
            if resp.status_code == 200:
                data = resp.json()
                count = len(data.get("data", []))
                return TestConnectionResponse(success=True, message=f"Connected. {count} model(s) available.")
            return TestConnectionResponse(success=False, message=f"HTTP {resp.status_code}: {resp.text[:100]}")

        elif provider == "openrouter":
            return await _verify_openrouter_key(api_key, db)

        elif provider == "moonshot":
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://api.moonshot.cn/v1/models",
                    headers={"Authorization": f"Bearer {api_key or ''}"}
                )
            if resp.status_code == 200:
                data = resp.json()
                count = len(data.get("data", []))
                return TestConnectionResponse(success=True, message=f"Connected. {count} model(s) available.")
            return TestConnectionResponse(success=False, message=f"HTTP {resp.status_code}")

        elif provider == "minimax":
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://api.minimax.chat/v1/models",
                    headers={"Authorization": f"Bearer {api_key or ''}"}
                )
            if resp.status_code == 200:
                data = resp.json()
                count = len(data.get("data", []))
                return TestConnectionResponse(success=True, message=f"Connected. {count} model(s) available.")
            return TestConnectionResponse(success=False, message=f"HTTP {resp.status_code}")

        elif provider == "zai":
            target_url = (base_url or "https://api.z.ai").rstrip("/")
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{target_url}/api/v1/models",
                    headers={"Authorization": f"Bearer {api_key or ''}"}
                )
            if resp.status_code == 200:
                return TestConnectionResponse(success=True, message="Connected.")
            return TestConnectionResponse(success=False, message=f"HTTP {resp.status_code}")

        else:
            return TestConnectionResponse(success=False, message=f"Unknown provider: {provider}")

    except Exception as exc:
        return TestConnectionResponse(success=False, message=str(exc))
