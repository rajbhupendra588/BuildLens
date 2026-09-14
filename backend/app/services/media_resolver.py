import re
from pathlib import Path
from typing import Any

from app.services.document_storage_service import document_storage

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"}

_IMAGE_DISPLAY_QUERY = re.compile(
    r"(?i)("
    r"show\s+me\s+(?:the\s+)?(?:image|picture|photo|figure|diagram|screenshot)"
    r"|(?:display|show|see|view|open|render)\s+(?:me\s+)?(?:the\s+)?"
    r"(?:image|picture|photo|figure|diagram|screenshot)"
    r"|what\s+(?:does|do)\s+(?:the|this)\s+(?:image|picture|diagram)\s+(?:look|show)"
    r"|(?:image|picture|photo|figure|diagram|screenshot)\s+(?:of|from)"
    r")",
)


def is_image_filename(file_name: str) -> bool:
    return Path(file_name).suffix.lower() in _IMAGE_EXTENSIONS


def wants_image_display(query: str) -> bool:
    q = query.strip()
    if _IMAGE_DISPLAY_QUERY.search(q):
        return True
    if re.search(r"(?i)\.(png|jpe?g|gif|webp)\b", q) and re.search(
        r"(?i)(show|display|see|view|open)", q
    ):
        return True
    return False


def _filename_mentioned_in_query(file_name: str, query: str) -> bool:
    q = query.lower()
    name = file_name.lower()
    if name in q:
        return True
    stem = Path(file_name).stem.lower()
    if stem in q:
        return True
    stem_spaced = stem.replace("_", " ").replace("-", " ")
    if stem_spaced in q:
        return True
    return False


def build_media_attachments(
    query: str,
    context_chunks: list[dict[str, Any]],
    indexed_documents: list[dict[str, str]],
) -> list[dict[str, str]]:
    """Resolve image files to display inline in the chat UI."""
    show_images = wants_image_display(query)
    seen: set[str] = set()
    items: list[dict[str, str]] = []

    def add(document_id: str, file_name: str) -> None:
        if document_id in seen or not is_image_filename(file_name):
            return
        if not document_storage.exists(document_id):
            return
        seen.add(document_id)
        items.append(
            {
                "document_id": document_id,
                "file_name": file_name,
                "media_type": "image",
            }
        )

    for chunk in context_chunks:
        meta = chunk.get("metadata") or {}
        doc_id = meta.get("document_id")
        file_name = meta.get("file_name") or ""
        if doc_id and is_image_filename(file_name):
            add(doc_id, file_name)

    if show_images:
        for doc in indexed_documents:
            if not is_image_filename(doc["file_name"]):
                continue
            if _filename_mentioned_in_query(doc["file_name"], query):
                add(doc["document_id"], doc["file_name"])

        if not items:
            tokens = [
                t
                for t in re.findall(r"[a-z0-9]+", query.lower())
                if len(t) > 3
            ]
            for doc in indexed_documents:
                if not is_image_filename(doc["file_name"]):
                    continue
                stem = Path(doc["file_name"]).stem.lower()
                if tokens and any(t in stem for t in tokens):
                    add(doc["document_id"], doc["file_name"])

        if not items:
            images = [
                d for d in indexed_documents if is_image_filename(d["file_name"])
            ]
            if len(images) == 1:
                add(images[0]["document_id"], images[0]["file_name"])

    return items
