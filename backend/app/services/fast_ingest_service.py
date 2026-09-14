"""Choose fast text extraction vs slow Docling for indexing."""

from pathlib import Path

from app.core.config import settings
from app.services.quick_extract_service import (
    QuickExtractResult,
    extract_docx_for_full_index,
    extract_pdf_for_full_index,
)


def try_fast_text_index(path: Path, filename: str) -> QuickExtractResult | None:
    """
    Return extracted text when we can skip Docling (typical text PDF/DOCX).
    Return None to fall back to Docling (scanned PDFs, PPTX, images).
    """
    ext = Path(filename).suffix.lower()
    size = path.stat().st_size

    if ext == ".pdf" and size <= settings.INGEST.FAST_PDF_MAX_BYTES:
        result = extract_pdf_for_full_index(path)
        if len(result.text.strip()) >= settings.INGEST.FAST_PDF_MIN_TEXT_CHARS:
            return result
        return None

    if ext == ".docx" and size <= settings.INGEST.FAST_DOCX_MAX_BYTES:
        result = extract_docx_for_full_index(path)
        if len(result.text.strip()) >= settings.INGEST.FAST_PDF_MIN_TEXT_CHARS:
            return result
        return None

    return None
