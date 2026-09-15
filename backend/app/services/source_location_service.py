"""Page, paragraph, and line metadata for evidence citations."""

from __future__ import annotations

import re
from typing import Any


def char_to_line_range(text: str, start: int, end: int) -> tuple[int, int]:
    start = max(0, min(start, len(text)))
    end = max(start, min(end, len(text)))
    line_start = text[:start].count("\n") + 1
    line_end = text[:end].count("\n") + 1
    return line_start, line_end


def char_to_paragraph_index(text: str, char_pos: int) -> int:
    char_pos = max(0, min(char_pos, len(text)))
    before = text[:char_pos]
    if not before.strip():
        return 1
    return len(re.findall(r"\n\s*\n", before)) + 1


def enrich_location_metadata(meta: dict[str, Any], content: str) -> dict[str, Any]:
    """Fill missing line/paragraph fields from chunk text (query-time fallback)."""
    if not content or not content.strip():
        return meta

    if meta.get("line_start") is None:
        meta["line_start"] = 1
        meta["line_end"] = max(1, content.count("\n") + 1)

    if meta.get("paragraph_index") is None:
        paragraphs = [p for p in re.split(r"\n\s*\n", content.strip()) if p.strip()]
        meta["paragraph_index"] = 1
        if len(paragraphs) > 1:
            meta["paragraph_count_in_chunk"] = len(paragraphs)

    return meta


def format_location_label(meta: dict[str, Any]) -> str:
    """Human-readable location for LLM context headers and source cards."""
    parts: list[str] = []
    page = meta.get("page_number")
    if page is not None:
        parts.append(f"page {page}")

    para = meta.get("paragraph_index")
    if para is not None:
        parts.append(f"paragraph {para}")

    line_start = meta.get("line_start")
    line_end = meta.get("line_end")
    if line_start is not None:
        if line_end is not None and line_end != line_start:
            parts.append(f"lines {line_start}–{line_end}")
        else:
            parts.append(f"line {line_start}")

    section = meta.get("section_title")
    if section and not parts:
        parts.append(f'section "{section}"')

    return ", ".join(parts) if parts else "location unknown"
