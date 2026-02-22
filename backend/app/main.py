import platform
from importlib import metadata
from fastapi import FastAPI
from qdrant_client import QdrantClient
from app.core.config import settings

# Fetch version from pyproject.toml (Standard for 2026)
try:
    __version__ = metadata.version("docrag")
except metadata.PackageNotFoundError:
    __version__ = "0.1.0"

app = FastAPI(
    title="DocRAG API",
    version=__version__,
)

@app.get("/health")
async def health_check():
    db_alive = False
    qdrant_status = "unknown"
    
    try:
        # Use the nested settings logic we defined
        client = QdrantClient(url=settings.QDRANT.url) 
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
            "url": settings.QDRANT.url
        },
        "llm": {
            "provider": settings.LLM.PROVIDER
        }
    }