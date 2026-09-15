import asyncio
import platform
from importlib import metadata
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from qdrant_client import QdrantClient
from app.core.config import settings
from app.api.v1 import (
    ingest,
    query,
    chat,
    documents,
    models,
    settings as settings_router,
    data as data_router,
    workspace as workspace_router,
    reports as reports_router,
)
from app.api import auth as auth_router
from app.core.deps import get_current_user
from app.core.csrf import OriginCheckMiddleware, SecurityHeadersMiddleware
from app.core.exceptions import UnexpectedResponse, global_exception_handler
from app.core.database import init_db
from app.services.quick_extract_service import quiet_pdf_parser_logs
from app.services.ingest_worker_pool import get_ingest_worker_pool
from app.models.settings import AppSetting as _AppSetting  # noqa: F401 — ensures AppSetting table is registered
from app.models.session_attachment import SessionAttachment as _SessionAttachment  # noqa: F401
from app.models.document_catalog import DocumentCatalog as _DocumentCatalog  # noqa: F401
from app.models.user import User as _User  # noqa: F401
from app.models.auth_session import AuthSession as _AuthSession  # noqa: F401
from app.models.password_reset import PasswordResetToken as _PasswordResetToken  # noqa: F401
from app.models.ingest_job import IngestJob as _IngestJob  # noqa: F401
from app.models.report import DocumentReport as _DocumentReport  # noqa: F401

# Fetch version from pyproject.toml (Standard for 2026)
try:
    __version__ = metadata.version("buildlens")
except metadata.PackageNotFoundError:
    __version__ = "0.1.0"

app = FastAPI(
    title="BuildLens API",
    version=__version__,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(OriginCheckMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.AUTH.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_protected = [Depends(get_current_user)]

# Include API Routers
app.include_router(auth_router.router)
app.include_router(ingest.router, prefix="/api/v1", dependencies=_protected)
app.include_router(query.router, prefix="/api/v1", dependencies=_protected)
app.include_router(chat.router, prefix="/api/v1", dependencies=_protected)
app.include_router(documents.router, prefix="/api/v1", dependencies=_protected)
app.include_router(models.router, prefix="/api/v1", dependencies=_protected)
app.include_router(settings_router.router, prefix="/api/v1", dependencies=_protected)
app.include_router(data_router.router, prefix="/api/v1", dependencies=_protected)
app.include_router(workspace_router.router, prefix="/api/v1", dependencies=_protected)
app.include_router(reports_router.router, prefix="/api/v1", dependencies=_protected)

# Register Exception Handler
if UnexpectedResponse is not None:
    app.add_exception_handler(UnexpectedResponse, global_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)

@app.on_event("startup")
def on_startup():
    quiet_pdf_parser_logs()
    init_db()
    get_ingest_worker_pool().master_start()

def _ping_qdrant() -> str:
    client = QdrantClient(
        url=f"http://{settings.QDRANT.HOST}:{settings.QDRANT.PORT}",
        timeout=3,
    )
    client.get_collections()
    return "connected"


@app.get("/health")
async def health_check():
    db_alive = False
    qdrant_status = "unknown"

    try:
        qdrant_status = await asyncio.to_thread(_ping_qdrant)
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
        },
        "ingest_workers": get_ingest_worker_pool().status(),
    }