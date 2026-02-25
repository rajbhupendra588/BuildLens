import io
import json
import re
import uuid
from pathlib import Path
from typing import Any, List

import pandas as pd
from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
from docling_core.types.doc.document import DoclingDocument

from app.core.config import settings

# ── Language detection ────────────────────────────────────────────────────────

_EXT_LANGUAGE: dict[str, str] = {
    ".py": "python", ".pyw": "python",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".java": "java",
    ".kt": "kotlin", ".kts": "kotlin",
    ".go": "go",
    ".rs": "rust",
    ".c": "c", ".h": "c",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hxx": "cpp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".dart": "dart",
    ".sh": "shell", ".bash": "shell", ".zsh": "shell",
    ".sql": "sql",
    ".yaml": "yaml", ".yml": "yaml",
    ".toml": "toml",
    ".xml": "xml",
    ".html": "html", ".htm": "html",
    ".css": "css", ".scss": "css", ".sass": "css",
    ".r": "r",
    ".scala": "scala",
    ".lua": "lua",
    ".tf": "terraform",
    ".dockerfile": "dockerfile",
    ".ini": "ini", ".cfg": "ini", ".env": "ini",
}

# Regex patterns that mark the START of a top-level definition in each language.
# Used to find natural split boundaries in source files.
_SPLIT_PATTERN: dict[str, str] = {
    "python":     r"^(class |def |async def )",
    "javascript": r"^(class |function |const |let |var |async function |export )",
    "typescript": r"^(class |function |const |let |var |async function |export |interface |type )",
    "java":       r"^\s*(public|private|protected|static|abstract|@interface|class|interface|enum)\s",
    "kotlin":     r"^(class |fun |object |interface |data class |sealed class )",
    "go":         r"^func ",
    "rust":       r"^(pub |fn |struct |impl |trait |enum |mod )",
    "c":          r"^[a-zA-Z_][\w\s\*]+\s+\w+\s*\(",
    "cpp":        r"^(class |struct |namespace |[a-zA-Z_][\w<>\s\*:]+\s+\w+\s*\()",
    "ruby":       r"^(def |class |module )",
    "php":        r"^(function |class |interface |trait |abstract class )",
    "swift":      r"^(func |class |struct |enum |protocol |extension )",
    "dart":       r"^(class |void |Future|Stream|Widget)",
    "sql":        r"(?i)^(CREATE |ALTER |DROP |SELECT |INSERT |UPDATE |DELETE |WITH )",
}


class ChunkingService:
    # Chars per chunk for plain-text / code fallback
    CHUNK_SIZE = 1200
    # Overlap keeps context at boundaries (≈16% of chunk)
    OVERLAP = 200

    def __init__(self):
        self.chunker = HybridChunker(
            tokenizer=settings.CHUNK_TOKENIZER,
            max_tokens=512,
            merge_peers=True,
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _make_chunk(
        self,
        content: str,
        file_name: str,
        document_id: str,
        index: int,
        extra_meta: dict | None = None,
    ) -> dict:
        meta = {
            "document_id": document_id,
            "file_name": file_name,
            "chunk_index": index,
            "char_count": len(content),
            "token_count": 0,
        }
        if extra_meta:
            meta.update(extra_meta)
        return {"id": str(uuid.uuid4()), "content": content, "metadata": meta}

    def _simple_split(
        self,
        text: str,
        file_name: str,
        document_id: str,
        start_index: int = 0,
        extra_meta: dict | None = None,
    ) -> List[dict]:
        """Character-based splitter with overlap. Used as fallback."""
        stride = self.CHUNK_SIZE - self.OVERLAP
        chunks = []
        for i in range(0, len(text), stride):
            piece = text[i : i + self.CHUNK_SIZE]
            if not piece.strip():
                continue
            chunks.append(
                self._make_chunk(piece, file_name, document_id, start_index + len(chunks), extra_meta)
            )
        return chunks

    # ── Format-specific text extractors ──────────────────────────────────────

    def process_csv(self, file_content: bytes) -> str:
        try:
            df = pd.read_csv(io.BytesIO(file_content)).fillna("")
            rows = []
            for _, row in df.iterrows():
                parts = [f"{col}: {val}" for col, val in row.items() if str(val) != ""]
                if parts:
                    rows.append(", ".join(parts))
            return "\n".join(rows)
        except Exception as e:
            print(f"CSV parse error: {e}")
            return file_content.decode("utf-8", errors="ignore")

    def process_xlsx(self, file_content: bytes) -> str:
        try:
            sheets: dict = pd.read_excel(io.BytesIO(file_content), sheet_name=None)
            lines = []
            for sheet_name, df in sheets.items():
                df = df.fillna("")
                lines.append(f"[Sheet: {sheet_name}]")
                for _, row in df.iterrows():
                    parts = [f"{col}: {val}" for col, val in row.items() if str(val) != ""]
                    if parts:
                        lines.append(", ".join(parts))
            return "\n".join(lines)
        except Exception as e:
            print(f"XLSX parse error: {e}")
            return ""

    def process_json(self, file_content: bytes) -> str:
        try:
            data = json.loads(file_content.decode("utf-8"))
            lines: list[str] = []
            self._flatten_json(data, "", lines)
            return "\n".join(lines)
        except Exception:
            return file_content.decode("utf-8", errors="ignore")

    def _flatten_json(self, obj: Any, prefix: str, lines: list[str]):
        if isinstance(obj, dict):
            for k, v in obj.items():
                self._flatten_json(v, f"{prefix}.{k}" if prefix else str(k), lines)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                self._flatten_json(v, f"{prefix}[{i}]", lines)
        else:
            lines.append(f"{prefix}: {obj}")

    # ── Source-code chunker ───────────────────────────────────────────────────

    def chunk_source_code(self, text: str, file_name: str, document_id: str) -> List[dict]:
        ext = Path(file_name).suffix.lower()
        language = _EXT_LANGUAGE.get(ext, "text")
        pattern = _SPLIT_PATTERN.get(language)

        # Split on definition boundaries; fall back to whole-text
        if pattern:
            # Use lookahead so the delimiter stays with the following block
            segments = re.split(rf"(?m)(?={pattern})", text)
        else:
            segments = [text]

        chunks: List[dict] = []
        for seg in segments:
            seg = seg.strip()
            if not seg:
                continue
            extra = {"language": language}
            if len(seg) > self.CHUNK_SIZE:
                chunks.extend(
                    self._simple_split(seg, file_name, document_id, len(chunks), extra)
                )
            else:
                chunks.append(self._make_chunk(seg, file_name, document_id, len(chunks), extra))
        return chunks

    # ── Markdown / plain-text chunker (heading-aware) ────────────────────────

    def _chunk_headings(self, text: str, file_name: str, document_id: str) -> List[dict]:
        # Split on Markdown headings (# / ## / ###…)
        sections = re.split(r"(?m)^(?=#{1,6} )", text)
        chunks: List[dict] = []
        for section in sections:
            section = section.strip()
            if not section:
                continue
            if len(section) <= self.CHUNK_SIZE:
                chunks.append(self._make_chunk(section, file_name, document_id, len(chunks)))
            else:
                chunks.extend(
                    self._simple_split(section, file_name, document_id, len(chunks))
                )
        return chunks

    # ── Docling-document chunker ──────────────────────────────────────────────

    def _chunk_docling(self, doc, file_name: str, document_id: str) -> List[dict]:
        raw_chunks = self.chunker.chunk(doc)
        result: List[dict] = []
        for i, chunk in enumerate(raw_chunks):
            text = (
                self.chunker.serialize(chunk)
                if hasattr(self.chunker, "serialize")
                else str(chunk)
            )
            token_count = self.chunker.tokenizer.count_tokens(text)

            meta: dict = {
                "document_id": document_id,
                "file_name": file_name,
                "chunk_index": i,
                "char_count": len(text),
                "token_count": token_count,
            }

            # Enrich with Docling structural info where available
            if hasattr(chunk, "meta") and chunk.meta:
                cm = chunk.meta
                if hasattr(cm, "headings") and cm.headings:
                    meta["section_title"] = cm.headings[-1]
                if hasattr(cm, "doc_items") and cm.doc_items:
                    item = cm.doc_items[0]
                    if hasattr(item, "label"):
                        meta["element_type"] = str(item.label)
                    if hasattr(item, "prov") and item.prov:
                        prov = item.prov[0]
                        if hasattr(prov, "page_no"):
                            meta["page_number"] = prov.page_no

            result.append({"id": str(uuid.uuid4()), "content": text, "metadata": meta})
        return result

    # ── Public API ────────────────────────────────────────────────────────────

    def split_content(
        self,
        input_data: Any,
        file_name: str,
        document_id: str = "",
        file_type: str = "text",
    ) -> List[dict]:
        """
        Route to the correct chunking strategy based on file_type.

        file_type values (set by file_service):
          'docling' | 'csv' | 'xlsx' | 'json' | 'text' | 'code'
        """
        ext = Path(file_name).suffix.lower()

        # Docling rich document (PDF, DOCX, PPTX, images)
        if file_type == "docling" or isinstance(input_data, (DoclingDocument, dict)):
            return self._chunk_docling(input_data, file_name, document_id)

        # Source code
        if file_type == "code" or ext in _EXT_LANGUAGE:
            return self.chunk_source_code(str(input_data), file_name, document_id)

        # Markdown / plain text — heading-aware
        if ext in {".md", ".txt"} or file_type == "text":
            return self._chunk_headings(str(input_data), file_name, document_id)

        # Generic fallback with overlap
        return self._simple_split(str(input_data), file_name, document_id)


chunking_service = ChunkingService()
