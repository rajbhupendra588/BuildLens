import platform
from importlib import metadata
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from qdrant_client import QdrantClient
from app.core.config import settings
from app.api.v1 import ingest, query, chat, documents, models, settings as settings_router, data as data_router
from app.core.exceptions import global_exception_handler
from app.core.database import init_db
from app.models.settings import AppSetting as _AppSetting  # noqa: F401 — ensures AppSetting table is registered

# Fetch version from pyproject.toml (Standard for 2026)
try:
    __version__ = metadata.version("docrag")
except metadata.PackageNotFoundError:
    __version__ = "0.1.0"

app = FastAPI(
    title="DocRAG API",
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # URL frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(ingest.router, prefix="/api/v1")
app.include_router(query.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(models.router, prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1")
app.include_router(data_router.router, prefix="/api/v1")

# Register Exception Handler
app.add_exception_handler(Exception, global_exception_handler)

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/health")
async def health_check():
    db_alive = False
    qdrant_status = "unknown"
    
    try:
        # Use the nested settings logic we defined
        client = QdrantClient(url=f"http://{settings.QDRANT.HOST}:{settings.QDRANT.PORT}") 
        # get_collections() returns a list of collections
        collections = client.get_collections()
        qdrant_status = "connected"
        db_alive = True
    except Exception as e:
        qdrant_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "app_version": __version__,
        "python_version": platform.python_version(),
        "environment": settings.ENVIRONMENT,
        "qdrant": {
            "connected": db_alive,
            "status": qdrant_status,
            "url": f"http://{settings.QDRANT.HOST}:{settings.QDRANT.PORT}"
        },
        "llm": {
            "provider": settings.LLM.PROVIDER
        }
    }