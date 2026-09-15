from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.core.database import engine, get_session
from app.core.deps import get_current_user
from app.models.report import DocumentReport
from app.models.user import User
from app.schemas.report import CreateReportRequest, ReportResponse, ReportType
from app.services.access_control import require_chat_session
from app.services.document_catalog_service import document_catalog_service
from app.services.report_service import report_service, resolve_document_ids, to_response
from app.services.settings_service import settings_service

router = APIRouter(prefix="/reports", tags=["Reports"])

_KEY_MAP = {
    "openai": "openai_api_key",
    "gemini": "gemini_api_key",
    "anthropic": "anthropic_api_key",
    "openrouter": "openrouter_api_key",
    "moonshot": "moonshot_api_key",
    "minimax": "minimax_api_key",
    "zai": "zai_api_key",
}


def provider_api_key(db: Session, provider: str) -> Optional[str]:
    if provider not in _KEY_MAP:
        return None
    return settings_service.get(_KEY_MAP[provider], db)


async def run_report_generation(
    report_id: uuid.UUID,
    user_id: uuid.UUID,
    provider: str,
    model: str,
    api_key: Optional[str],
    document_names: list[str],
) -> None:
    with Session(engine) as db:
        user = db.get(User, user_id)
        row = db.get(DocumentReport, report_id)
        if user is None or row is None:
            return
        await report_service.generate(
            db,
            row,
            user,
            provider=provider,
            model=model,
            api_key=api_key,
            document_names=document_names,
        )


@router.post("", response_model=ReportResponse)
async def create_report(
    payload: CreateReportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    provider: str = Query("ollama"),
    model: str = Query("minimax-m2:cloud"),
):
    session_id = None
    if payload.sessionId:
        try:
            session_id = uuid.UUID(payload.sessionId)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid sessionId") from exc
        require_chat_session(db, current_user, session_id)

    document_ids = resolve_document_ids(
        db,
        current_user,
        payload.documentIds,
        session_id=session_id,
    )
    if not document_ids:
        raise HTTPException(
            status_code=400,
            detail="No documents are in the current report scope.",
        )

    names = []
    for doc_id in document_ids:
        row = document_catalog_service.get(db, doc_id)
        names.append(row.file_name if row else doc_id)

    title = (
        f"Document Report — {names[0]}"
        if len(names) == 1
        else f"Document Report — {len(names)} documents"
    )
    report = report_service.create_report(
        db,
        current_user,
        document_ids,
        report_type=ReportType.FULL_DOCUMENT_REPORT.value,
        session_id=session_id,
        project_id=payload.projectId,
        title=title,
    )
    api_key = provider_api_key(db, provider)
    background_tasks.add_task(
        run_report_generation,
        report.id,
        current_user.id,
        provider,
        model,
        api_key,
        names,
    )
    return to_response(report, include_content=False)


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    row = report_service.get_owned(db, current_user, report_id)
    return to_response(row)


@router.get("/{report_id}/pdf")
async def download_report_pdf(
    report_id: uuid.UUID,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    row = report_service.get_owned(db, current_user, report_id)
    if row.status != "COMPLETED" or not row.pdf_path:
        raise HTTPException(status_code=404, detail="Report PDF is not available yet.")
    from pathlib import Path

    path = Path(row.pdf_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Report PDF is not available yet.")
    filename = row.download_name or f"BuildLens_Report_{report_id}.pdf"
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=filename,
        content_disposition_type="attachment",
    )
