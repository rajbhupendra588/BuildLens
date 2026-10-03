import asyncio
import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session
import httpx

from app.services.llm_service import llm_service
from app.services.settings_service import settings_service
from app.core.database import get_session

router = APIRouter(prefix="/models", tags=["Models"])

_CUSTOM_MODELS_KEY = "custom_models"
_MAX_CUSTOM_MODELS = 50
_MODEL_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
_ALLOWED_PROVIDERS = frozenset(
    {
        "ollama",
        "openai",
        "anthropic",
        "gemini",
        "openrouter",
        "zai",
        "moonshot",
        "minimax",
    }
)

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

# Chat-panel OpenRouter allowlist — other providers stay available in Settings.
_OPENROUTER_CHAT_MODELS = [
    {"name": "inclusionai/ling-3.0-flash-fin:free", "provider": "openrouter"},
    {"name": "poolside/laguna-s-2.1:free", "provider": "openrouter"},
    {"name": "nvidia/nemotron-3-super-120b-a12b:free", "provider": "openrouter"},
    {"name": "nvidia/nemotron-3-ultra-550b-a55b:free", "provider": "openrouter"},
]


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


class CustomModelBody(BaseModel):
    provider: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=128)


def _load_custom_models(db: Session) -> list[dict]:
    raw = settings_service.get(_CUSTOM_MODELS_KEY, db)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []

    models: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for item in data:
        if not isinstance(item, dict):
            continue
        provider = str(item.get("provider", "")).strip().lower()
        name = str(item.get("name", "")).strip()
        key = (provider, name)
        if provider not in _ALLOWED_PROVIDERS or not name or key in seen:
            continue
        seen.add(key)
        models.append({"provider": provider, "name": name})
    return models


def _save_custom_models(models: list[dict], db: Session) -> None:
    settings_service.set(_CUSTOM_MODELS_KEY, json.dumps(models), db)


def _normalize_custom_model(body: CustomModelBody) -> dict:
    provider = body.provider.strip().lower()
    name = body.name.strip()
    if provider not in _ALLOWED_PROVIDERS:
        raise HTTPException(status_code=400, detail="Choose a supported provider.")
    if not _MODEL_NAME_RE.fullmatch(name):
        raise HTTPException(
            status_code=400,
            detail="Model id can use letters, numbers, and . _ : / -",
        )
    return {"provider": provider, "name": name}


def _merge_custom_models(models: list[dict], custom: list[dict]) -> list[dict]:
    index = {(item["provider"], item["name"]): i for i, item in enumerate(models)}
    merged = [dict(item) for item in models]
    for item in custom:
        key = (item["provider"], item["name"])
        if key in index:
            merged[index[key]]["custom"] = True
            continue
        merged.append({**item, "custom": True})
    return merged


@router.get("/custom")
async def list_custom_models(db: Session = Depends(get_session)):
    return {"models": _load_custom_models(db)}


@router.post("/custom")
async def add_custom_model(body: CustomModelBody, db: Session = Depends(get_session)):
    model = _normalize_custom_model(body)
    models = _load_custom_models(db)
    key = (model["provider"], model["name"])
    if any((item["provider"], item["name"]) == key for item in models):
        raise HTTPException(status_code=409, detail="That model is already added.")
    if len(models) >= _MAX_CUSTOM_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"You can add up to {_MAX_CUSTOM_MODELS} models.",
        )
    models.append(model)
    _save_custom_models(models, db)
    return {"models": models}


@router.delete("/custom")
async def remove_custom_model(body: CustomModelBody, db: Session = Depends(get_session)):
    model = _normalize_custom_model(body)
    models = _load_custom_models(db)
    key = (model["provider"], model["name"])
    remaining = [item for item in models if (item["provider"], item["name"]) != key]
    if len(remaining) == len(models):
        raise HTTPException(status_code=404, detail="Model not found.")
    _save_custom_models(remaining, db)
    return {"models": remaining}


@router.get("/")
async def list_models(db: Session = Depends(get_session)):
    openai_key = settings_service.get("openai_api_key", db)
    gemini_key = settings_service.get("gemini_api_key", db)
    anthropic_key = settings_service.get("anthropic_api_key", db)
    openrouter_key = settings_service.get("openrouter_api_key", db)
    openrouter_models = [
        {
            "name": item["name"][: -len(":free")] if openrouter_key and item["name"].endswith(":free") else item["name"],
            "provider": "openrouter",
        }
        for item in _OPENROUTER_CHAT_MODELS
    ]

    # All fetches run concurrently — total time = slowest provider, not the sum
    ollama_result, openai_result, gemini_result, anthropic_result = await asyncio.gather(
        llm_service.fetch_ollama_models(),
        _fetch_openai_models(openai_key),
        _fetch_gemini_models(gemini_key),
        _fetch_anthropic_models(anthropic_key),
    )

    custom_models = _load_custom_models(db)
    catalog = _merge_custom_models(
        [
            *[{"name": m["name"], "provider": "ollama"} for m in ollama_result],
            *openrouter_models,
            *openai_result,
            *gemini_result,
            *anthropic_result,
        ],
        custom_models,
    )
    return {
        "local": [m for m in catalog if m["provider"] == "ollama"],
        "cloud": [m for m in catalog if m["provider"] != "ollama"],
    }
