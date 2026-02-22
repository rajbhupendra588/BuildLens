import os
from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

DOTENV_PATH = Path(__file__).resolve().parent.parent.parent.parent / ".env"

class QdrantSettings(BaseSettings):
    """Configuration for the Vector Database."""
    HOST: str = "qdrant"
    PORT: int = 6333
    COLLECTION_NAME: str = "doc_rag_knowledge"

class LLMSettings(BaseSettings):
    """Configuration for AI Providers."""
    PROVIDER: Literal["ollama", "openai", "anthropic", "gemini"] = "ollama"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None

class Settings(BaseSettings):
    """Global Application Settings."""
    # App Config
    APP_NAME: str = "DocRAG"
    ENVIRONMENT: Literal["development", "production", "test"] = "development"

    # Embedding Model
    EMBED_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Nested Settings
    QDRANT: QdrantSettings = QdrantSettings()
    LLM: LLMSettings = LLMSettings()

    model_config = SettingsConfigDict(
        env_file=DOTENV_PATH if DOTENV_PATH.exists() else None,
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=False,
    )

settings = Settings()