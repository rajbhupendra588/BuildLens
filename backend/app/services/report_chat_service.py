"""SSE helper so /report runs inside the existing chat stream."""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, AsyncGenerator, Optional

from sqlmodel import Session

from app.models.user import User
from app.schemas.report import ReportStatus
from app.services.chat_history_service import chat_history_service
from app.services.document_catalog_service import document_catalog_service
from app.services.intent_service import IntentMode, intent_classifier
from app.services.report_service import report_service, resolve_document_ids, to_response


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def report_followup_chunks(content: dict[str, Any]) -> list[dict[str, Any]]:
    """Inject generated report JSON as high-priority chat context."""
    names = content.get("document_names") or []
    summary = content.get("executive_summary") or ""
    findings = content.get("top_findings") or []
    risks = content.get("risks") or []
    gaps = content.get("gaps") or []
    conflicts = content.get("conflicts") or []
    facts = content.get("key_facts") or []
    body = [
        "Generated BuildLens document report (use this together with original document evidence).",
        f"Documents: {', '.join(names)}" if names else "",
        f"Executive summary: {summary}" if summary else "",
    ]
    if findings:
        body.append("Key findings:")
        for item in findings[:8]:
            text = item.get("text") if isinstance(item, dict) else str(item)
            body.append(f"- {text}")
    if facts:
        body.append("Key facts:")
        for item in facts[:12]:
            if isinstance(item, dict):
                body.append(f"- {item.get('attribute')}: {item.get('value')}")
    if risks:
        body.append("Risks:")
        for item in risks[:8]:
            if isinstance(item, dict):
                body.append(f"- {item.get('risk')} (impact: {item.get('impact')})")
    if gaps:
        body.append("Gaps:")
        for item in gaps[:8]:
            text = item.get("gap") if isinstance(item, dict) else str(item)
            body.append(f"- {text}")
    if conflicts:
        body.append("Conflicts:")
        for item in conflicts[:6]:
            if isinstance(item, dict):
                body.append(f"- {item.get('topic')}: {item.get('status')}")
    text = "\n".join(line for line in body if line)
    return [
        {
            "content": text[:12000],
            "score": 2.0,
            "metadata": {
                "file_name": "Generated Report",
                "element_type": "routing_hint",
                "source_index": None,
            },
        }
    ]


async def stream_report_command(
    *,
    db: Session,
    current_user: User,
    session_id: uuid.UUID,
    user_row,
    provider: str,
    model: str,
    api_key: Optional[str],
    scoped_library_ids: list[str],
) -> AsyncGenerator[str, None]:
    yield _sse(
        {
            "type": "user_message",
            "id": str(user_row.id),
            "created_at": user_row.created_at.isoformat(),
        }
    )
    intent = intent_classifier.result_for_mode(
        IntentMode.DOCUMENT_REPORT,
        has_context=True,
        confidence=1.0,
        signals=["slash_command:/report"],
    )
    yield _sse(
        {
            "type": "intent",
            "mode": intent.mode.value,
            "label": intent.label,
            "icon": intent.icon,
        }
    )
    yield _sse({"type": "status", "text": "Analyzing document..."})

    document_ids = resolve_document_ids(
        db,
        current_user,
        [],
        session_id=session_id,
        scoped_library_ids=scoped_library_ids,
    )
    names = []
    for doc_id in document_ids:
        row = document_catalog_service.get(db, doc_id)
        names.append(row.file_name if row else doc_id)

    scope_label = (
        names[0]
        if len(names) == 1
        else (f"{len(names)} selected documents" if names else "No documents")
    )
    yield _sse(
        {
            "type": "report_scope",
            "label": scope_label,
            "document_names": names,
            "document_ids": document_ids,
        }
    )

    if not document_ids:
        err = (
            "No documents are in the current report scope. "
            "Upload a document or attach files to this conversation, then run /report."
        )
        yield _sse({"type": "error", "content": err})
        assistant_row = chat_history_service.add_message(
            db,
            session_id,
            "assistant",
            err,
            provider,
            model,
            sources=[],
            detected_mode=intent.mode.value,
        )
        yield _sse(
            {
                "type": "assistant_saved",
                "id": str(assistant_row.id),
                "created_at": assistant_row.created_at.isoformat(),
            }
        )
        return

    report = report_service.create_report(
        db,
        current_user,
        document_ids,
        session_id=session_id,
        title=f"Document Report — {scope_label}",
    )
    yield _sse({"type": "report_started", "reportId": str(report.id)})

    progress_queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def emit_progress(message: str) -> None:
        await progress_queue.put(message)

    async def _generate():
        from app.core.database import engine
        from app.models.report import DocumentReport
        from sqlmodel import Session as SqlSession

        try:
            with SqlSession(engine) as gen_db:
                row = gen_db.get(DocumentReport, report.id)
                user = gen_db.get(User, current_user.id)
                if row is None or user is None:
                    return None
                return await report_service.generate(
                    gen_db,
                    row,
                    user,
                    provider=provider,
                    model=model,
                    api_key=api_key,
                    progress=emit_progress,
                    document_names=names,
                )
        finally:
            await progress_queue.put(None)

    task = asyncio.create_task(_generate())
    while True:
        message = await progress_queue.get()
        if message is None:
            break
        yield _sse({"type": "status", "text": message})
    await task
    db.expire_all()
    completed = report_service.get_owned(db, current_user, report.id)

    if completed.status != ReportStatus.COMPLETED.value:
        err = completed.error_message or "We couldn't generate the report. Please try again."
        yield _sse({"type": "error", "content": err})
        assistant_row = chat_history_service.add_message(
            db,
            session_id,
            "assistant",
            err,
            provider,
            model,
            sources=[],
            detected_mode=intent.mode.value,
        )
        yield _sse(
            {
                "type": "assistant_saved",
                "id": str(assistant_row.id),
                "created_at": assistant_row.created_at.isoformat(),
            }
        )
        return

    payload = to_response(completed).model_dump(mode="json")
    yield _sse({"type": "report", "report": payload})

    summary = ""
    if isinstance(completed.content, dict):
        summary = str(completed.content.get("executive_summary") or "").strip()
    assistant_text = (
        f"Document report generated for {scope_label}."
        + (f"\n\n{summary}" if summary else "")
        + "\n\nOpen the report to review findings, citations, and download the PDF."
    )
    media = [
        {
            "media_type": "document_report",
            "report_id": str(completed.id),
            "title": completed.title,
            "page_count": completed.page_count,
            "document_names": names,
            "download_name": completed.download_name,
            "limitations": (completed.content or {}).get("limitations")
            if isinstance(completed.content, dict)
            else None,
        }
    ]
    source_cards = []
    if isinstance(completed.content, dict):
        for src in completed.content.get("sources") or []:
            if not isinstance(src, dict):
                continue
            source_cards.append(
                {
                    "document_id": src.get("document_id"),
                    "chunk_id": src.get("chunk_id"),
                    "file_name": src.get("file_name") or "Unknown",
                    "score": 1.0,
                    "snippet": src.get("snippet") or "",
                    "page_number": src.get("page_number"),
                    "section_title": src.get("section_title"),
                    "location_label": src.get("location_label"),
                    "source_index": src.get("index"),
                    "element_type": src.get("element_type"),
                }
            )
    yield _sse({"type": "sources", "sources": source_cards})
    yield _sse({"type": "content", "text": assistant_text})

    assistant_row = chat_history_service.add_message(
        db,
        session_id,
        "assistant",
        assistant_text,
        provider,
        model,
        sources=source_cards or None,
        media=media,
        detected_mode=intent.mode.value,
    )
    yield _sse(
        {
            "type": "assistant_saved",
            "id": str(assistant_row.id),
            "created_at": assistant_row.created_at.isoformat(),
        }
    )
    yield _sse({"type": "done"})
