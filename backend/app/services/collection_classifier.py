"""Document collection classification for construction document libraries."""

from __future__ import annotations

from typing import Final

# Keep in sync with frontend `DOCUMENT_SCOPE_OPTIONS` ids (except "all").
COLLECTION_IDS: Final[tuple[str, ...]] = (
    "architectural",
    "structural",
    "electrical",
    "plumbing",
    "hvac",
    "boq",
    "contracts",
    "approvals",
    "site-reports",
    "specifications",
    "general",
)

_KEYWORDS: dict[str, tuple[str, ...]] = {
    "architectural": (
        "arch",
        "architectural",
        "a-",
        "floor plan",
        "elevation",
    ),
    "structural": (
        "struct",
        "structural",
        "s-",
        "foundation",
        "rebar",
    ),
    "electrical": (
        "electrical",
        "elec",
        "e-",
        "lighting",
        "load",
    ),
    "plumbing": ("plumb", "plumbing", "p-", "sanitary"),
    "hvac": ("hvac", "mechanical", "m-", "duct"),
    "boq": ("boq", "bill of quantities", "quantity"),
    "contracts": ("contract", "agreement", "tender"),
    "approvals": ("approval", "permit", "noc"),
    "site-reports": ("site report", "daily report", "progress"),
    "specifications": ("spec", "specification", "technical spec"),
}


def classify_collection(file_name: str) -> str:
    lower = (file_name or "").lower()
    for collection_id, keywords in _KEYWORDS.items():
        if any(k in lower for k in keywords):
            return collection_id
    return "general"


def scope_to_collection(scope_id: str | None) -> str | None:
    if not scope_id or scope_id == "all":
        return None
    if scope_id in _KEYWORDS:
        return scope_id
    return None
