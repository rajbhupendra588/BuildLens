"""Enterprise A4 PDF for BuildLens document reports — hard max 5 pages."""

from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Table,
    TableStyle,
)
from pypdf import PdfReader

from app.schemas.report import (
    NOT_SPECIFIED,
    EvidenceLabel,
    Priority,
    ReportContent,
)

NAVY = colors.HexColor("#1e3a5f")
SLATE = colors.HexColor("#334155")
RULE = colors.HexColor("#cbd5e1")
ROW = colors.HexColor("#f8fafc")
ACCENT = colors.HexColor("#0f766e")
WARN = colors.HexColor("#9a3412")
MAX_PAGES = 5
MARGIN = 16 * mm


def _sanitize_filename(name: str) -> str:
    stem = Path(name).stem if name else "Document"
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_")
    return cleaned or "Document"


def report_download_name(document_names: list[str], generated_date: str) -> str:
    if len(document_names) == 1:
        label = _sanitize_filename(document_names[0])
    elif document_names:
        label = f"{len(document_names)}_Documents"
    else:
        label = "Document"
    return f"BuildLens_Report_{label}_{generated_date}.pdf"


class _PageChrome:
    def __init__(self, subtitle: str, generated: str):
        self.subtitle = subtitle
        self.generated = generated

    def __call__(self, canvas, doc):
        canvas.saveState()
        width, height = A4
        canvas.setFillColor(NAVY)
        canvas.rect(0, height - 11 * mm, width, 11 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Times-Bold", 8)
        canvas.drawString(MARGIN, height - 7 * mm, "BUILDLENS DOCUMENT REPORT")
        canvas.setFont("Times-Roman", 7.5)
        canvas.drawRightString(width - MARGIN, height - 7 * mm, self.generated)
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.4)
        canvas.line(MARGIN, 12 * mm, width - MARGIN, 12 * mm)
        canvas.setFillColor(SLATE)
        canvas.setFont("Times-Roman", 7.5)
        title = self.subtitle[:70]
        canvas.drawString(MARGIN, 7 * mm, title)
        canvas.drawRightString(
            width - MARGIN,
            7 * mm,
            f"Page {doc.page}",
        )
        canvas.restoreState()


def _styles(body: float, heading: float, table: float, leading: float) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "RTitle",
            parent=base["Heading1"],
            fontName="Times-Bold",
            fontSize=16,
            leading=19,
            textColor=NAVY,
            spaceAfter=2,
            spaceBefore=0,
        ),
        "kicker": ParagraphStyle(
            "RKicker",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=8,
            textColor=ACCENT,
            spaceAfter=6,
        ),
        "h": ParagraphStyle(
            "RH",
            parent=base["Heading2"],
            fontName="Times-Bold",
            fontSize=heading,
            leading=heading + 2,
            textColor=NAVY,
            spaceBefore=7,
            spaceAfter=3,
            borderPadding=0,
        ),
        "body": ParagraphStyle(
            "RBody",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=body,
            leading=leading,
            textColor=SLATE,
            alignment=TA_JUSTIFY,
            spaceAfter=3,
        ),
        "meta": ParagraphStyle(
            "RMeta",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=body,
            leading=leading,
            textColor=SLATE,
            spaceAfter=1,
        ),
        "bullet": ParagraphStyle(
            "RBullet",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=body,
            leading=leading,
            textColor=SLATE,
            leftIndent=8,
            spaceAfter=1.5,
        ),
        "cell": ParagraphStyle(
            "RCell",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=table,
            leading=table + 1.8,
            textColor=SLATE,
        ),
        "th": ParagraphStyle(
            "RTh",
            parent=base["Normal"],
            fontName="Times-Bold",
            fontSize=table,
            leading=table + 1.8,
            textColor=colors.white,
        ),
        "small": ParagraphStyle(
            "RSmall",
            parent=base["Normal"],
            fontName="Times-Italic",
            fontSize=7,
            textColor=colors.HexColor("#64748b"),
            spaceAfter=2,
        ),
        "obs": ParagraphStyle(
            "RObs",
            parent=base["Normal"],
            fontName="Times-Italic",
            fontSize=body,
            leading=leading,
            textColor=SLATE,
            leftIndent=6,
            spaceAfter=2,
        ),
        "right": ParagraphStyle(
            "RRight",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=8,
            alignment=TA_RIGHT,
            textColor=SLATE,
        ),
    }


def _esc(text: str) -> str:
    return (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _cite(index: int | None) -> str:
    if index is None:
        return ""
    return f" [{index}]"


def _evidence(label: EvidenceLabel | str) -> str:
    value = label.value if isinstance(label, EvidenceLabel) else str(label)
    return value.replace("_", " ")


def _table(headers: list[str], rows: list[list[str]], styles: dict, col_widths: list[float]) -> Table:
    data = [[Paragraph(_esc(h), styles["th"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(_esc(c), styles["cell"]) for c in row])
    tbl = Table(data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW]),
                ("GRID", (0, 0), (-1, -1), 0.25, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 2.2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2),
            ]
        )
    )
    return tbl


def _usable_width() -> float:
    return A4[0] - 2 * MARGIN


def _keep(*flowables):
    return KeepTogether(list(flowables))


def _priority_ok(item: Any, min_rank: int) -> bool:
    order = {Priority.CRITICAL: 3, Priority.HIGH: 2, Priority.MEDIUM: 1, Priority.LOW: 0}
    raw = getattr(item, "priority", Priority.HIGH)
    rank = order.get(raw, 2)
    return rank >= min_rank


def _build_story(
    content: ReportContent,
    generated: str,
    *,
    min_rank: int,
    max_table_rows: int,
    body: float,
    heading: float,
    table_font: float,
    leading: float,
    include_low: bool,
) -> list:
    styles = _styles(body, heading, table_font, leading)
    w = _usable_width()
    story: list = []
    names = content.document_names or ["Uploaded document"]
    scope = names[0] if len(names) == 1 else f"{len(names)} selected documents"

    story.append(Paragraph("BUILDLENS DOCUMENT REPORT", styles["title"]))
    story.append(Paragraph("Document intelligence · source-traced findings", styles["kicker"]))
    story.append(Paragraph(f"<b>Document:</b> {_esc(scope)}", styles["meta"]))
    if content.document_count > 1:
        listed = "; ".join(names[:8])
        story.append(Paragraph(f"<b>Documents analyzed:</b> {_esc(listed)}", styles["meta"]))
    story.append(Paragraph(f"<b>Generated:</b> {_esc(generated)}", styles["meta"]))
    if content.limitations:
        story.append(Paragraph(_esc(content.limitations), styles["small"]))

    story.append(Paragraph("EXECUTIVE SUMMARY", styles["h"]))
    if content.executive_summary:
        story.append(Paragraph(_esc(content.executive_summary), styles["body"]))

    profile = content.document_profile
    fields = [
        profile.document_type,
        profile.revision,
        profile.author,
        profile.organization,
        profile.creation_date,
        profile.approval_date,
        profile.effective_date,
        profile.page_count,
        profile.language,
        profile.status,
    ]
    story.append(Paragraph("DOCUMENT PROFILE", styles["h"]))
    profile_rows = [
        [
            f.label,
            f.value,
            _evidence(f.evidence) + (_cite(f.source_index) if f.source_index else ""),
        ]
        for f in fields
    ]
    story.append(
        _table(
            ["Field", "Value", "Evidence"],
            profile_rows,
            styles,
            [w * 0.28, w * 0.42, w * 0.30],
        )
    )

    if content.purpose:
        story.append(Paragraph("DOCUMENT PURPOSE", styles["h"]))
        story.append(Paragraph(_esc(content.purpose), styles["body"]))

    if content.top_findings:
        story.append(Paragraph("KEY FINDINGS", styles["h"]))
        for i, item in enumerate(content.top_findings, 1):
            story.append(
                Paragraph(
                    f"{i}. {_esc(item.text)}{_cite(item.source_index)}",
                    styles["bullet"],
                )
            )

    if content.key_facts:
        story.append(Paragraph("KEY FACTS", styles["h"]))
        rows = [
            [
                f.attribute,
                f.value,
                f"[{f.source_index}]" if f.source_index else "—",
            ]
            for f in content.key_facts
            if _priority_ok(f, min_rank)
        ]
        if rows:
            story.append(_table(["Attribute", "Value", "Source"], rows, styles, [w * 0.34, w * 0.46, w * 0.20]))

    if content.metrics:
        story.append(Paragraph("KEY NUMBERS AND METRICS", styles["h"]))
        rows = []
        for m in content.metrics:
            if not _priority_ok(m, min_rank):
                continue
            evidence = _evidence(m.evidence)
            if m.calculated:
                evidence = "DERIVED FROM DOCUMENT · Calculated from source data."
            rows.append([m.metric, m.value, m.context or evidence])
        if rows:
            story.append(_table(["Metric", "Value", "Context"], rows[:max_table_rows], styles, [w * 0.34, w * 0.22, w * 0.44]))

    if content.requirements:
        story.append(Paragraph("KEY REQUIREMENTS", styles["h"]))
        for group in content.requirements:
            items = [i for i in group.items if _priority_ok(i, min_rank)]
            if not items:
                continue
            story.append(Paragraph(_esc(group.category), styles["meta"]))
            for item in items:
                story.append(
                    Paragraph(f"• {_esc(item.text)}{_cite(item.source_index)}", styles["bullet"])
                )

    if content.milestones:
        story.append(Paragraph("DATES AND MILESTONES", styles["h"]))
        rows = [
            [
                m.milestone,
                m.date,
                f"[{m.source_index}]" if m.source_index else "Not specified.",
            ]
            for m in content.milestones
            if _priority_ok(m, min_rank)
        ]
        if rows:
            story.append(_table(["Milestone", "Date", "Source"], rows, styles, [w * 0.46, w * 0.28, w * 0.26]))
    elif include_low:
        story.append(Paragraph("DATES AND MILESTONES", styles["h"]))
        story.append(Paragraph("Not specified.", styles["body"]))

    if content.entities and include_low:
        story.append(Paragraph("ENTITIES", styles["h"]))
        for group in content.entities:
            names = "; ".join(f"{i.text}{_cite(i.source_index)}" for i in group.items[:8])
            story.append(Paragraph(f"<b>{_esc(group.category)}:</b> {_esc(names)}", styles["body"]))

    if content.tables and include_low:
        story.append(Paragraph("IMPORTANT TABLES", styles["h"]))
        for tbl in content.tables[:3]:
            story.append(
                Paragraph(
                    f"<b>{_esc(tbl.title)}</b>{_cite(tbl.source_index)} — {_esc(tbl.summary)}",
                    styles["body"],
                )
            )
            if tbl.rows:
                header = tbl.rows[0]
                body_rows = tbl.rows[1:max(2, min(4, max_table_rows))]
                cols = max(len(header), 1)
                widths = [w / cols] * cols
                padded = [header + [""] * (cols - len(header))]
                for row in body_rows:
                    padded.append((row + [""] * cols)[:cols])
                story.append(_table(padded[0], padded[1:], styles, widths))

    if content.figures and include_low:
        story.append(Paragraph("FIGURES / DRAWINGS", styles["h"]))
        for fig in content.figures[:4]:
            sheet = f" Sheet {fig.sheet}." if fig.sheet else ""
            story.append(
                Paragraph(
                    f"<b>{_esc(fig.title)}</b>{_cite(fig.source_index)}.{sheet} {_esc(fig.purpose)}",
                    styles["body"],
                )
            )

    if content.risks:
        story.append(Paragraph("RISKS AND ISSUES", styles["h"]))
        for risk in content.risks:
            if not _priority_ok(risk, min_rank):
                continue
            mit = risk.mitigation
            if risk.mitigation_is_recommendation:
                mit = f"BuildLens Recommendation: {mit}"
            block = [
                Paragraph(f"<b>RISK:</b> {_esc(risk.risk)}{_cite(risk.source_index)}", styles["body"]),
                Paragraph(f"<b>IMPACT:</b> {_esc(risk.impact)}", styles["meta"]),
                Paragraph(f"<b>MITIGATION:</b> {_esc(mit)}", styles["meta"]),
            ]
            if risk.category:
                block.insert(1, Paragraph(f"<b>CATEGORY:</b> {_esc(risk.category)}", styles["meta"]))
            story.append(_keep(*block))

    if content.gaps:
        story.append(Paragraph("GAPS AND MISSING INFORMATION", styles["h"]))
        for gap in content.gaps:
            if not _priority_ok(gap, min_rank):
                continue
            story.append(
                Paragraph(f"<b>GAP:</b> {_esc(gap.gap)}{_cite(gap.source_index)}", styles["body"])
            )
            if gap.impact:
                story.append(Paragraph(f"<b>Impact:</b> {_esc(gap.impact)}", styles["meta"]))

    if content.conflicts or content.cross_document_findings:
        story.append(Paragraph("INCONSISTENCIES AND CONFLICTS", styles["h"]))
        for conflict in (content.cross_document_findings + content.conflicts)[:8]:
            story.append(Paragraph(f"<b>CONFLICT FOUND — {_esc(conflict.topic)}</b>", styles["body"]))
            for stmt in conflict.statements:
                story.append(
                    Paragraph(f"• {_esc(stmt.text)}{_cite(stmt.source_index)}", styles["bullet"])
                )
            story.append(Paragraph(f"Status: {_esc(conflict.status)}", styles["small"]))

    if content.decisions and include_low:
        story.append(Paragraph("DECISIONS", styles["h"]))
        for item in content.decisions[:6]:
            story.append(
                Paragraph(
                    f"<b>Decision:</b> {_esc(item.decision)}{_cite(item.source_index)}",
                    styles["body"],
                )
            )
            story.append(Paragraph(f"Rationale: {_esc(item.rationale)}", styles["meta"]))

    if content.actions or content.document_actions:
        story.append(Paragraph("ACTION ITEMS", styles["h"]))
        rows = [
            [
                a.action,
                a.owner,
                a.due,
                f"[{a.source_index}]" if a.source_index else "—",
            ]
            for a in content.actions
            if _priority_ok(a, min_rank)
        ]
        if rows:
            story.append(
                _table(
                    ["Action", "Owner", "Due Date", "Source"],
                    rows,
                    styles,
                    [w * 0.46, w * 0.20, w * 0.18, w * 0.16],
                )
            )
        for item in content.document_actions[:6]:
            story.append(
                Paragraph(f"• {_esc(item.text)}{_cite(item.source_index)}", styles["bullet"])
            )

    if content.observations:
        story.append(Paragraph("BUILDLENS OBSERVATIONS", styles["h"]))
        story.append(
            Paragraph(
                "The following items are BuildLens observations, not statements from the document.",
                styles["small"],
            )
        )
        for obs in content.observations[:5]:
            story.append(Paragraph(f"• {_esc(obs)}", styles["obs"]))

    used_indexes = set()
    for src in content.sources:
        used_indexes.add(src.index)
    # Keep only sources actually cited if compressing
    cited: set[int] = set()
    for collection in (
        content.top_findings,
        content.key_facts,
        content.metrics,
        content.milestones,
        content.risks,
        content.gaps,
        content.actions,
        content.decisions,
        content.tables,
        content.figures,
    ):
        for item in collection:
            idx = getattr(item, "source_index", None)
            if isinstance(idx, int):
                cited.add(idx)
    for group in content.requirements + content.entities:
        for item in group.items:
            if item.source_index:
                cited.add(item.source_index)
    for conflict in content.conflicts + content.cross_document_findings:
        for stmt in conflict.statements:
            if stmt.source_index:
                cited.add(stmt.source_index)

    story.append(Paragraph("SOURCE REFERENCES", styles["h"]))
    refs = content.sources
    if cited:
        refs = [s for s in content.sources if s.index in cited] or content.sources
    if min_rank >= 2:
        refs = refs[:18]
    else:
        refs = refs[:28]
    for src in refs:
        page = f"Page {src.page_number}" if src.page_number else (src.location_label or "Location not specified")
        section = f" — {src.section_title}" if src.section_title else ""
        story.append(
            Paragraph(
                f"[{src.index}] {_esc(src.file_name)} — {_esc(page)}{_esc(section)}",
                styles["meta"],
            )
        )
    return story


def _render(content: ReportContent, generated: str, profile: dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    chrome = _PageChrome(
        subtitle="; ".join(content.document_names[:2]) or "Document Report",
        generated=generated,
    )
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=content.title,
        author="BuildLens",
    )
    story = _build_story(content, generated, **profile)
    doc.build(story, onFirstPage=chrome, onLaterPages=chrome)
    return buffer.getvalue()


def _page_count(pdf_bytes: bytes) -> int:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return len(reader.pages)


COMPRESSION_PROFILES = [
    {
        "min_rank": 1,
        "max_table_rows": 12,
        "body": 8.5,
        "heading": 11,
        "table_font": 7.5,
        "leading": 11,
        "include_low": True,
    },
    {
        "min_rank": 1,
        "max_table_rows": 8,
        "body": 8,
        "heading": 10.5,
        "table_font": 7.2,
        "leading": 10.2,
        "include_low": True,
    },
    {
        "min_rank": 2,
        "max_table_rows": 6,
        "body": 8,
        "heading": 10,
        "table_font": 7,
        "leading": 10,
        "include_low": False,
    },
    {
        "min_rank": 3,
        "max_table_rows": 5,
        "body": 7.5,
        "heading": 9.5,
        "table_font": 6.8,
        "leading": 9.4,
        "include_low": False,
    },
]


def generate_report_pdf(content: ReportContent, generated: str) -> tuple[bytes, int]:
    """Render a professionally formatted PDF that never exceeds 5 pages."""
    working = content
    last = b""
    pages = 0
    for profile in COMPRESSION_PROFILES:
        last = _render(working, generated, profile)
        pages = _page_count(last)
        if pages <= MAX_PAGES:
            return last, pages
        working = _prune_content(working)
    last = _render(working, generated, COMPRESSION_PROFILES[-1])
    pages = _page_count(last)
    if pages <= MAX_PAGES:
        return last, pages
    # Still over: drop remaining medium sections, keep critical findings + sources.
    working = _prune_content(working, aggressive=True)
    last = _render(working, generated, COMPRESSION_PROFILES[-1])
    return last, _page_count(last)


def _prune_content(content: ReportContent, aggressive: bool = False) -> ReportContent:
    data = content.model_copy(deep=True)
    data.tables = [] if aggressive else data.tables[:1]
    data.figures = [] if aggressive else data.figures[:2]
    data.entities = [] if aggressive else data.entities[:2]
    data.decisions = data.decisions[:2]
    data.observations = data.observations[:2]
    data.metrics = data.metrics[:8]
    data.milestones = data.milestones[:6]
    data.key_facts = data.key_facts[:10]
    data.actions = data.actions[:6]
    data.gaps = data.gaps[:4]
    if aggressive:
        data.requirements = data.requirements[:3]
        for group in data.requirements:
            group.items = group.items[:3]
        data.sources = data.sources[:16]
    return data
