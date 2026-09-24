import os
from pathlib import Path
from typing import Literal
from pydantic import BaseModel
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
    # Optional safety cap on vector chunks per file (0 = no limit).
    MAX_INDEX_CHUNKS: int = 0
    # Target size when merging spreadsheet/CSV rows into one RAG chunk (~512 tokens).
    TABULAR_CHUNK_TARGET_CHARS: int = 4_000
    # PDFs under this size try pypdf text first (seconds). Docling only if text is empty.
    FAST_PDF_MAX_BYTES: int = 50 * 1024 * 1024
    FAST_PDF_MIN_TEXT_CHARS: int = 80
    FAST_INDEX_MAX_CHARS: int = 800_000
    FAST_DOCX_MAX_BYTES: int = 15 * 1024 * 1024
    # Chunks yielded per ingest step before embed (lower = less RAM during tabular ingest).
    CHUNK_YIELD_BATCH_SIZE: int = 32
    # Embedding upsert batch size (raise on machines with more RAM; default tuned for Docker 6GiB).
    EMBED_BATCH_SIZE: int = 8
    # Load FastEmbed at API startup so ingest does not spike parse + model download together.
    PRELOAD_EMBED_MODEL: bool = True
    # Worker loop poll interval when queue is empty (seconds).
    WORKER_POLL_SECONDS: float = 2.0
    # Master spawns ingest worker threads in-process (uploads_data indexing).
    ENABLE_WORKER_POOL: bool = True
    # Hard ceiling for parallel workers (absolute max 5 in code).
    WORKER_MAX_PARALLEL: int = 5
    # Set to 0 to disable pool; set 1–5 to override auto plan.
    WORKER_COUNT: int | None = None
    # Container/host RAM hint for plan (0 = ignore). Docker: set ~ mem_limit in GiB.
    WORKER_MEMORY_BUDGET_GB: float = 0.0


class StorageSettings(BaseSettings):
    """On-disk storage for original uploaded files (images, PDFs, etc.)."""
    UPLOAD_DIR: str = "uploads_data"
    REPORTS_DIR: str = "reports_data"
    # Max upload size (bytes). Default 20 MiB per file.
    MAX_UPLOAD_BYTES: int = 20 * 1024 * 1024
    MAX_LIBRARY_FILES: int = 5
    MAX_SESSION_ATTACHMENTS: int = 5
    # Stream read/write chunk size while saving uploads (16 MiB — fewer syscalls on large files).
    UPLOAD_STREAM_CHUNK_BYTES: int = 16 * 1024 * 1024


class AuthSettings(BaseModel):
    """Username/password sessions, cookies, and brute-force limits."""

    COOKIE_NAME: str = "buildlens_session"
    COOKIE_SECURE: bool = False
    SESSION_TTL_SECONDS: int = 60 * 60 * 24 * 7
    RESET_TOKEN_TTL_MINUTES: int = 60
    LOGIN_MAX_FAILURES: int = 8
    LOGIN_LOCKOUT_MINUTES: int = 15
    LOGIN_RATE_LIMIT_PER_MINUTE: int = 10
    FORGOT_RATE_LIMIT_PER_MINUTE: int = 5
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    PUBLIC_APP_URL: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


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
    AUTH: AuthSettings = AuthSettings()

    model_config = SettingsConfigDict(
        env_file=DOTENV_PATH if DOTENV_PATH.exists() else None,
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=False,
    )

settings = Settings()