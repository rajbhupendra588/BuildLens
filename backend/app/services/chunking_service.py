import io
import json
import re
import uuid
from pathlib import Path
from typing import Any, Iterator, List

import pandas as pd
from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
from docling_core.types.doc.document import DoclingDocument

from app.core.config import settings
from app.services.source_location_service import (
    char_to_line_range,
    char_to_paragraph_index,
)

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
        self._chunker = None

    @property
    def chunker(self):
        if self._chunker is None:
            self._chunker = HybridChunker(
                tokenizer=settings.CHUNK_TOKENIZER,
                max_tokens=512,
                merge_peers=True,
            )
        return self._chunker

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
            end_i = i + len(piece)
            line_start, line_end = char_to_line_range(text, i, end_i)
            loc_meta = {
                "line_start": line_start,
                "line_end": line_end,
                "paragraph_index": char_to_paragraph_index(text, i),
            }
            merged_extra = {**(extra_meta or {}), **loc_meta}
            chunks.append(
                self._make_chunk(
                    piece,
                    file_name,
                    document_id,
                    start_index + len(chunks),
                    merged_extra,
                )
            )
        return chunks

    # ── Format-specific text extractors ──────────────────────────────────────

    def _tabular_row_line(self, row: Any) -> str | None:
        parts = [f"{col}: {val}" for col, val in row.items() if str(val) != ""]
        if not parts:
            return None
        return ", ".join(parts)

    def _tabular_values_line(self, columns: list[str], values: tuple[Any, ...]) -> str | None:
        parts: list[str] = []
        for col, val in zip(columns, values):
            if val is None:
                continue
            text = str(val).strip()
            if not text:
                continue
            parts.append(f"{col}: {text}")
        if not parts:
            return None
        return ", ".join(parts)

    def _iter_xlsx_openpyxl_batches(
        self,
        path: Path,
        *,
        target: int,
        batch_size: int,
        file_name: str,
        document_id: str,
        owner_meta: dict | None,
    ) -> Iterator[list[dict]]:
        from openpyxl import load_workbook

        chunk_index = 0
        pending: list[dict] = []

        def emit(content: str, sheet_name: str) -> Iterator[list[dict]]:
            nonlocal chunk_index, pending
            meta = {"format": "tabular", "sheet": sheet_name}
            chunk = self._make_chunk(
                content, file_name, document_id, chunk_index, meta
            )
            if owner_meta:
                chunk["metadata"].update(owner_meta)
            pending.append(chunk)
            chunk_index += 1
            while len(pending) >= batch_size:
                yield pending[:batch_size]
                pending = pending[batch_size:]

        wb = load_workbook(path, read_only=True, data_only=True)
        try:
            for ws in wb.worksheets:
                sheet_name = ws.title
                rows = ws.iter_rows(values_only=True)
                header_row = next(rows, None)
                if not header_row:
                    continue
                columns = [
                    str(h).strip() if h is not None and str(h).strip() else f"column_{i}"
                    for i, h in enumerate(header_row)
                ]
                block_lines: list[str] = []
                block_chars = 0
                header = f"[Sheet: {sheet_name}]"

                for row in rows:
                    if not row:
                        continue
                    line = self._tabular_values_line(columns, row)
                    if not line:
                        continue
                    extra = len(line) + 1
                    if block_lines and block_chars + extra > target:
                        content = header + "\n" + "\n".join(block_lines)
                        yield from emit(content, sheet_name)
                        block_lines = []
                        block_chars = 0
                    block_lines.append(line)
                    block_chars += extra

                if block_lines:
                    content = header + "\n" + "\n".join(block_lines)
                    yield from emit(content, sheet_name)
        finally:
            wb.close()

        if pending:
            yield pending

    def iter_tabular_index_batches(
        self,
        source: Path | bytes,
        file_name: str,
        document_id: str,
        file_type: str,
        owner_user_id: str | None = None,
        *,
        batch_size: int | None = None,
    ) -> Iterator[list[dict]]:
        """
        Stream CSV/XLSX rows into merged text chunks (many rows per chunk).
        Reads from disk Path when possible (avoids duplicating upload bytes in RAM).
        XLSX is processed one sheet at a time to limit peak memory.
        """
        if batch_size is None:
            batch_size = settings.INGEST.CHUNK_YIELD_BATCH_SIZE
        batch_size = max(1, min(batch_size, 128))

        target = max(800, settings.INGEST.TABULAR_CHUNK_TARGET_CHARS)
        owner_meta = {"user_id": owner_user_id} if owner_user_id else None
        chunk_index = 0
        pending: list[dict] = []

        def emit(content: str, sheet_name: str) -> Iterator[list[dict]]:
            nonlocal chunk_index, pending
            meta = {"format": "tabular", "sheet": sheet_name}
            chunk = self._make_chunk(
                content, file_name, document_id, chunk_index, meta
            )
            if owner_meta:
                chunk["metadata"].update(owner_meta)
            pending.append(chunk)
            chunk_index += 1
            while len(pending) >= batch_size:
                yield pending[:batch_size]
                pending = pending[batch_size:]

        def process_sheet(sheet_name: str, df: pd.DataFrame) -> Iterator[list[dict]]:
            block_lines: list[str] = []
            block_chars = 0
            header = f"[Sheet: {sheet_name}]"

            for _, row in df.iterrows():
                line = self._tabular_row_line(row)
                if not line:
                    continue
                extra = len(line) + 1
                if block_lines and block_chars + extra > target:
                    content = header + "\n" + "\n".join(block_lines)
                    yield from emit(content, sheet_name)
                    block_lines = []
                    block_chars = 0
                block_lines.append(line)
                block_chars += extra

            if block_lines:
                content = header + "\n" + "\n".join(block_lines)
                yield from emit(content, sheet_name)

        try:
            if file_type == "csv":
                if isinstance(source, Path):
                    df = pd.read_csv(source).fillna("")
                else:
                    df = pd.read_csv(io.BytesIO(source)).fillna("")
                yield from process_sheet("CSV", df)
                del df
            elif file_type == "xlsx":
                if isinstance(source, Path):
                    yield from self._iter_xlsx_openpyxl_batches(
                        source,
                        target=target,
                        batch_size=batch_size,
                        file_name=file_name,
                        document_id=document_id,
                        owner_meta=owner_meta,
                    )
                    return
                excel = pd.ExcelFile(io.BytesIO(source))
                try:
                    for name in excel.sheet_names:
                        df = pd.read_excel(excel, sheet_name=name).fillna("")
                        yield from process_sheet(str(name), df)
                        del df
                finally:
                    excel.close()
            else:
                return
        except Exception as exc:
            print(f"Tabular read error ({file_type}): {exc}")
            return

        if pending:
            yield pending

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
        cursor = 0
        for section in sections:
            section = section.strip()
            if not section:
                continue
            pos = text.find(section, cursor)
            if pos < 0:
                pos = cursor
            end_pos = pos + len(section)
            loc_meta = {
                "line_start": char_to_line_range(text, pos, end_pos)[0],
                "line_end": char_to_line_range(text, pos, end_pos)[1],
                "paragraph_index": char_to_paragraph_index(text, pos),
            }
            cursor = end_pos
            if len(section) <= self.CHUNK_SIZE:
                chunks.append(
                    self._make_chunk(section, file_name, document_id, len(chunks), loc_meta)
                )
            else:
                chunks.extend(
                    self._simple_split(
                        section,
                        file_name,
                        document_id,
                        len(chunks),
                        loc_meta,
                    )
                )
        return chunks

    def _token_count(self, text: str) -> int:
        tok = getattr(self.chunker, "tokenizer", None)
        if tok is None:
            return max(1, (len(text) + 3) // 4)
        if hasattr(tok, "count_tokens"):
            try:
                return int(tok.count_tokens(text))
            except Exception:
                pass
        inner = getattr(tok, "tokenizer", None)
        if inner is not None and hasattr(inner, "count_tokens"):
            try:
                return int(inner.count_tokens(text))
            except Exception:
                pass
        return max(1, (len(text) + 3) // 4)

    # ── Docling-document chunker ──────────────────────────────────────────────

    def _chunk_docling(self, doc, file_name: str, document_id: str) -> List[dict]:
        raw_chunks = self.chunker.chunk(doc)
        serialized: list[tuple[Any, str]] = []
        for chunk in raw_chunks:
            text = (
                self.chunker.serialize(chunk)
                if hasattr(self.chunker, "serialize")
                else str(chunk)
            )
            serialized.append((chunk, text))

        full_doc = "\n\n".join(t for _, t in serialized)
        result: List[dict] = []
        cursor = 0
        for i, (chunk, text) in enumerate(serialized):
            token_count = self._token_count(text)
            # HybridChunker can still emit oversize pieces; split so embed
            # and the MiniLM tokenizer stay within 512 tokens.
            if token_count > 512:
                pos = full_doc.find(text, cursor)
                if pos < 0:
                    pos = cursor
                split_extra = {
                    "line_start": char_to_line_range(full_doc, pos, pos + len(text))[0],
                    "line_end": char_to_line_range(full_doc, pos, pos + len(text))[1],
                    "paragraph_index": char_to_paragraph_index(full_doc, pos),
                }
                cursor = pos + len(text)
                result.extend(
                    self._simple_split(
                        text,
                        file_name,
                        document_id,
                        len(result),
                        split_extra,
                    )
                )
                continue

            meta: dict = {
                "document_id": document_id,
                "file_name": file_name,
                "chunk_index": i,
                "char_count": len(text),
                "token_count": token_count,
            }

            pos = full_doc.find(text, cursor)
            if pos < 0:
                pos = cursor
            meta["line_start"] = char_to_line_range(full_doc, pos, pos + len(text))[0]
            meta["line_end"] = char_to_line_range(full_doc, pos, pos + len(text))[1]
            meta["paragraph_index"] = char_to_paragraph_index(full_doc, pos)
            cursor = pos + len(text)

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
                        bbox = _extract_bbox(prov)
                        if bbox:
                            meta["bbox"] = bbox

            result.append({"id": str(uuid.uuid4()), "content": text, "metadata": meta})
        return result

    # ── Public API ────────────────────────────────────────────────────────────

    def split_content(
        self,
        input_data: Any,
        file_name: str,
        document_id: str = "",
        file_type: str = "text",
        owner_user_id: str | None = None,
    ) -> List[dict]:
        """
        Route to the correct chunking strategy based on file_type.

        file_type values (set by file_service):
          'docling' | 'csv' | 'xlsx' | 'json' | 'text' | 'code'
        """
        ext = Path(file_name).suffix.lower()

        # Docling rich document (PDF, DOCX, PPTX, images)
        owner_meta = {"user_id": owner_user_id} if owner_user_id else None

        if file_type == "docling" or isinstance(input_data, (DoclingDocument, dict)):
            chunks = self._chunk_docling(input_data, file_name, document_id)
        elif file_type == "code" or ext in _EXT_LANGUAGE:
            chunks = self.chunk_source_code(str(input_data), file_name, document_id)
        elif file_type in {"csv", "xlsx"} or ext in {".csv", ".xlsx"}:
            # Tabular exports: size-based chunks (not heading-aware — avoids one chunk per row).
            chunks = self._simple_split(str(input_data), file_name, document_id)
        elif ext in {".md", ".txt"}:
            chunks = self._chunk_headings(str(input_data), file_name, document_id)
        elif file_type == "text":
            chunks = self._chunk_headings(str(input_data), file_name, document_id)
        else:
            chunks = self._simple_split(str(input_data), file_name, document_id)

        if owner_meta:
            for chunk in chunks:
                chunk["metadata"].update(owner_meta)
        return chunks

    def iter_split_batches(
        self,
        input_data: Any,
        file_name: str,
        document_id: str = "",
        file_type: str = "text",
        owner_user_id: str | None = None,
        *,
        batch_size: int | None = None,
    ) -> Iterator[list[dict]]:
        """
        Yield chunk dicts in batches so ingest never materializes tens of thousands at once.
        """
        if batch_size is None:
            batch_size = settings.INGEST.CHUNK_YIELD_BATCH_SIZE
        batch_size = max(1, min(batch_size, 128))

        text = str(input_data)
        ext = Path(file_name).suffix.lower()
        owner_meta = {"user_id": owner_user_id} if owner_user_id else None

        if file_type in {"csv", "xlsx"} or ext in {".csv", ".xlsx"}:
            splitter = "simple"
        elif ext in {".md", ".txt"} or file_type == "text":
            splitter = "headings"
        elif file_type == "code" or ext in _EXT_LANGUAGE:
            for batch in self._iter_code_batches(
                text, file_name, document_id, owner_meta, batch_size=batch_size
            ):
                yield batch
            return
        elif file_type == "docling" or isinstance(input_data, (DoclingDocument, dict)):
            all_chunks = self._chunk_docling(input_data, file_name, document_id)
            for i in range(0, len(all_chunks), batch_size):
                batch = all_chunks[i : i + batch_size]
                if owner_meta:
                    for chunk in batch:
                        chunk["metadata"].update(owner_meta)
                yield batch
            return
        else:
            splitter = "simple"

        if splitter == "headings":
            all_chunks = self._chunk_headings(text, file_name, document_id)
            for i in range(0, len(all_chunks), batch_size):
                batch = all_chunks[i : i + batch_size]
                if owner_meta:
                    for chunk in batch:
                        chunk["metadata"].update(owner_meta)
                yield batch
            return

        batch: list[dict] = []
        stride = self.CHUNK_SIZE - self.OVERLAP
        index = 0
        for i in range(0, len(text), stride):
            piece = text[i : i + self.CHUNK_SIZE]
            if not piece.strip():
                continue
            end_i = i + len(piece)
            line_start, line_end = char_to_line_range(text, i, end_i)
            loc_meta = {
                "line_start": line_start,
                "line_end": line_end,
                "paragraph_index": char_to_paragraph_index(text, i),
            }
            chunk = self._make_chunk(
                piece, file_name, document_id, index, loc_meta
            )
            if owner_meta:
                chunk["metadata"].update(owner_meta)
            batch.append(chunk)
            index += 1
            if len(batch) >= batch_size:
                yield batch
                batch = []
        if batch:
            yield batch

    def _iter_code_batches(
        self,
        text: str,
        file_name: str,
        document_id: str,
        owner_meta: dict | None,
        *,
        batch_size: int,
    ) -> Iterator[list[dict]]:
        all_chunks = self.chunk_source_code(text, file_name, document_id)
        for i in range(0, len(all_chunks), batch_size):
            batch = all_chunks[i : i + batch_size]
            if owner_meta:
                for chunk in batch:
                    chunk["metadata"].update(owner_meta)
            yield batch


def _extract_bbox(prov: object) -> dict[str, float] | None:
    """Normalize Docling provenance bounding boxes for client-side PDF highlight."""
    raw = getattr(prov, "bbox", None)
    if raw is None:
        return None

    def _pair(obj: object, keys: tuple[str, str, str, str]) -> dict[str, float] | None:
        try:
            vals = [float(getattr(obj, k)) for k in keys]
            return dict(zip(("l", "t", "r", "b"), vals))
        except (TypeError, ValueError, AttributeError):
            return None

    if isinstance(raw, dict):
        if all(k in raw for k in ("l", "t", "r", "b")):
            return {k: float(raw[k]) for k in ("l", "t", "r", "b")}
        if all(k in raw for k in ("x0", "y0", "x1", "y1")):
            x0, y0, x1, y1 = (float(raw[k]) for k in ("x0", "y0", "x1", "y1"))
            return {"l": x0, "t": y0, "r": x1, "b": y1}

    for keys in (("l", "t", "r", "b"), ("x0", "y0", "x1", "y1")):
        parsed = _pair(raw, keys)
        if parsed:
            if keys[0] == "x0":
                return parsed
            return parsed
    return None


chunking_service = ChunkingService()
