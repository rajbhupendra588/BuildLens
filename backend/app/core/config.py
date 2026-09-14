import os
from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

DOTENV_PATH = Path(__file__).resolve().parent.parent.parent.parent / ".env"

class QdrantSettings(BaseSettings):
    """Configuration for the Vector Database."""
    HOST: str = "qdrant"
    PORT: int = 6333
    COLLECTION_NAME: str = "knowledge_base"

class LLMSettings(BaseSettings):
    """Configuration for AI Providers."""
    PROVIDER: Literal["ollama", "openai", "anthropic", "gemini"] = "ollama"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None

class IngestSettings(BaseSettings):
    """Fast session preview vs full Docling pipeline."""
    QUICK_EXTRACT_MAX_CHARS: int = 120_000
    QUICK_PDF_MAX_PAGES: int = 20
    QUICK_XLSX_MAX_ROWS: int = 200
    # PDFs under this size try pypdf text first (seconds). Docling only if text is empty.
    FAST_PDF_MAX_BYTES: int = 50 * 1024 * 1024
    FAST_PDF_MIN_TEXT_CHARS: int = 80
    FAST_INDEX_MAX_CHARS: int = 800_000
    FAST_DOCX_MAX_BYTES: int = 15 * 1024 * 1024


class StorageSettings(BaseSettings):
    """On-disk storage for original uploaded files (images, PDFs, etc.)."""
    UPLOAD_DIR: str = "uploads_data"
    # Max upload size (bytes). Default 1 GiB.
    MAX_UPLOAD_BYTES: int = 1024 * 1024 * 1024
    # Stream read/write chunk size while saving uploads (8 MiB).
    UPLOAD_STREAM_CHUNK_BYTES: int = 8 * 1024 * 1024


class DatabaseSettings(BaseSettings):
    """Configuration for PostgreSQL."""
    USER: str = "postgres"
    PASSWORD: str = "password"
    HOST: str = "localhost"
    PORT: int = 5432
    NAME: str = "buildlens_db"

    @property
    def URL(self) -> str:
        return f"postgresql://{self.USER}:{self.PASSWORD}@{self.HOST}:{self.PORT}/{self.NAME}"

class Settings(BaseSettings):
    """Global Application Settings."""
    # App Config
    APP_NAME: str = "BuildLens"
    ENVIRONMENT: Literal["development", "production", "test"] = "development"

    # Embedding model – nomic has 8 192-token context window and 768 dims.
    # NOTE: if you already have data indexed with all-MiniLM-L6-v2 (384 dims)
    # go to Settings → Storage and clear the vector DB before reindexing.
    EMBED_MODEL: str = "nomic-ai/nomic-embed-text-v1.5"

    # Tokenizer used only for chunk-size counting inside HybridChunker.
    # Kept separate so the chunker doesn't need to download the full
    # embedding model just to count tokens.
    CHUNK_TOKENIZER: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Nested Settings
    QDRANT: QdrantSettings = QdrantSettings()
    LLM: LLMSettings = LLMSettings()
    DB: DatabaseSettings = DatabaseSettings()
    STORAGE: StorageSettings = StorageSettings()
    INGEST: IngestSettings = IngestSettings()

    model_config = SettingsConfigDict(
        env_file=DOTENV_PATH if DOTENV_PATH.exists() else None,
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=False,
    )

settings = Settings()