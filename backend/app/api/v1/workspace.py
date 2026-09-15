from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.core.config import settings as app_settings
from app.core.database import get_session
from app.services.settings_service import settings_service

router = APIRouter(prefix="/workspace", tags=["Workspace"])

PROJECT_NAME_KEY = "project_name"


class WorkspaceResponse(BaseModel):
    project_name: str
    project_subtitle: str = "Construction Project · Document intelligence"


class WorkspaceUpdate(BaseModel):
    project_name: str = Field(min_length=1, max_length=120)


@router.get("", response_model=WorkspaceResponse)
async def get_workspace(db: Session = Depends(get_session)):
    stored = settings_service.get(PROJECT_NAME_KEY, db)
    name = (stored or app_settings.APP_NAME or "BuildLens").strip()
    return WorkspaceResponse(project_name=name)


@router.patch("", response_model=WorkspaceResponse)
async def update_workspace(
    payload: WorkspaceUpdate,
    db: Session = Depends(get_session),
):
    settings_service.set(PROJECT_NAME_KEY, payload.project_name.strip(), db)
    return WorkspaceResponse(project_name=payload.project_name.strip())
