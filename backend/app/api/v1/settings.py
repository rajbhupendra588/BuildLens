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


@router.get("")
async def get_settings(db: Session = Depends(get_session)):
    """Return all settings; mask API keys if set."""
    raw = settings_service.get_all(db)

    # Apply environment defaults for values not yet saved in DB
    if "ollama_base_url" not in raw:
        raw["ollama_base_url"] = app_settings.LLM.OLLAMA_BASE_URL

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


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(body: TestConnectionRequest):
    """Test connectivity to a provider using the provided credentials."""
    provider = body.provider.lower()
    api_key = body.api_key
    base_url = body.base_url

    try:
        if provider == "ollama":
            url = (base_url or "http://localhost:11434").rstrip("/")
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
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {api_key or ''}"}
                )
            if resp.status_code == 200:
                data = resp.json()
                count = len(data.get("data", []))
                return TestConnectionResponse(success=True, message=f"Connected. {count} model(s) available.")
            return TestConnectionResponse(success=False, message=f"HTTP {resp.status_code}")

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
