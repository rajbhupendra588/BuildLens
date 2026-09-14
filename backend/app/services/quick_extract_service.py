"""Fast text extraction for session chat (seconds, not full Docling)."""

from __future__ import annotations

import json
import logging
import re
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import pandas as pd
from pypdf import PdfReader


class _DropPypdfEncodingNoise(logging.Filter):
    """pypdf logs ERROR for /SymbolSetEncoding on every page; extract still works."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            message = str(record.msg)
        return "Advanced encoding" not in message


def quiet_pdf_parser_logs() -> None:
    filt = _DropPypdfEncodingNoise()
    for name in ("pypdf", "pypdf._cmap", "pypdf._font", "pdfminer", "pdfminer.pdfinterp"):
        logger = logging.getLogger(name)
        if not any(isinstance(existing, _DropPypdfEncodingNoise) for existing in logger.filters):
            logger.addFilter(filt)


quiet_pdf_parser_logs()

from app.core.config import settings
from app.services.document_storage_service import document_storage

_TEXT_LIKE = {
    ".txt",
    ".md",
    ".puml",
    ".json",
    ".csv",
    ".html",
    ".htm",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".env",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".java",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".sh",
    ".sql",
    ".css",
    ".scss",
    ".sass",
    ".lua",
    ".tf",
    ".r",
    ".scala",
    ".dart",
    ".kt",
    ".swift",
    ".c",
    ".h",
    ".cpp",
}


@dataclass
class QuickExtractResult:
    text: str
    truncated: bool
    method: str


def _cap(text: str) -> tuple[str, bool]:
    limit = settings.INGEST.QUICK_EXTRACT_MAX_CHARS
    if len(text) <= limit:
        return text, False
    return text[:limit] + "\n\n[… quick preview truncated …]", True


def _read_text_file(path: Path) -> QuickExtractResult:
    raw = path.read_bytes()
    text = raw.decode("utf-8", errors="ignore")
    capped, truncated = _cap(text)
    return QuickExtractResult(capped, truncated, "text")


def _pdf_extract_text(path: Path, *, max_pages: int | None, char_cap: int) -> QuickExtractResult:
    reader = PdfReader(str(path))
    page_count = len(reader.pages)
    parts: list[str] = []
    total = 0
    truncated = False

    for i, page in enumerate(reader.pages):
        if max_pages is not None and i >= max_pages:
            truncated = True
            break
        piece = (page.extract_text() or "").strip()
        if not piece:
            continue
        if total + len(piece) > char_cap:
            remaining = char_cap - total
            if remaining > 0:
                parts.append(piece[:remaining])
            truncated = True
            break
        parts.append(piece)
        total += len(piece)

    text = "\n\n".join(parts)
    if max_pages is not None and page_count > max_pages:
        text += f"\n\n[Preview: first {max_pages} of {page_count} pages]"
    elif truncated:
        text += "\n\n[… text truncated for index limit …]"

    method = "pdf_fast" if max_pages is None else "pdf"
    return QuickExtractResult(text, truncated, method)


def _read_pdf(path: Path) -> QuickExtractResult:
    result = _pdf_extract_text(
        path,
        max_pages=settings.INGEST.QUICK_PDF_MAX_PAGES,
        char_cap=settings.INGEST.QUICK_EXTRACT_MAX_CHARS,
    )
    if not result.text.strip():
        return QuickExtractResult(
            "[PDF uploaded — text preview empty; scanned pages may use slower OCR.]",
            False,
            "pdf",
        )
    return result


def extract_pdf_for_full_index(path: Path) -> QuickExtractResult:
    """All pages via pypdf — typically seconds for text-based PDFs under ~50 MB."""
    return _pdf_extract_text(
        path,
        max_pages=None,
        char_cap=settings.INGEST.FAST_INDEX_MAX_CHARS,
    )


def extract_docx_for_full_index(path: Path) -> QuickExtractResult:
    with zipfile.ZipFile(path) as zf:
        xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
    text = re.sub(r"<[^>]+>", " ", xml)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > settings.INGEST.FAST_INDEX_MAX_CHARS:
        text = text[: settings.INGEST.FAST_INDEX_MAX_CHARS]
        return QuickExtractResult(text, True, "docx_fast")
    return QuickExtractResult(text, False, "docx_fast")


def _read_docx(path: Path) -> QuickExtractResult:
    with zipfile.ZipFile(path) as zf:
        xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
    text = re.sub(r"<[^>]+>", " ", xml)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        text = "[DOCX uploaded — quick preview empty; full parse runs in background.]"
    capped, truncated = _cap(text)
    return QuickExtractResult(capped, truncated, "docx")


def _read_xlsx(path: Path) -> QuickExtractResult:
    df = pd.read_excel(path, nrows=settings.INGEST.QUICK_XLSX_MAX_ROWS)
    text = df.to_string(index=False)
    capped, truncated = _cap(text)
    return QuickExtractResult(capped, truncated, "xlsx")


def _read_json(path: Path) -> QuickExtractResult:
    data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    text = json.dumps(data, indent=2)[: settings.INGEST.QUICK_EXTRACT_MAX_CHARS]
    return QuickExtractResult(text, len(str(data)) > len(text), "json")


def extract_from_document(document_id: str, filename: str) -> QuickExtractResult:
    path = document_storage.find_path(document_id)
    if not path or not path.is_file():
        return QuickExtractResult("", False, "missing")

    ext = Path(filename).suffix.lower()
    if filename.lower() == "dockerfile":
        return _read_text_file(path)
    if ext == ".pdf":
        return _read_pdf(path)
    if ext == ".docx":
        return _read_docx(path)
    if ext == ".xlsx":
        return _read_xlsx(path)
    if ext == ".json":
        try:
            return _read_json(path)
        except json.JSONDecodeError:
            return _read_text_file(path)
    if ext in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return QuickExtractResult(
            "[Image attached to this chat — use “show me the image” or ask about visible content after indexing.]",
            False,
            "image",
        )
    if ext in _TEXT_LIKE:
        return _read_text_file(path)

    try:
        return _read_text_file(path)
    except OSError:
        return QuickExtractResult(
            f"[File {filename} saved — quick preview unavailable; full indexing runs in background.]",
            False,
            "binary",
        )
