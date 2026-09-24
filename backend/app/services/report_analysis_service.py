"""Hierarchical full-document analysis for /report — extract, ground, synthesize."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from typing import Any, Awaitable, Callable, Optional

from app.schemas.report import (
    NOT_SPECIFIED,
    ActionRow,
    CitedText,
    ConflictItem,
    DecisionItem,
    DocumentProfile,
    EvidenceLabel,
    FactRow,
    FigureRef,
    GapItem,
    MetricRow,
    MilestoneRow,
    Priority,
    ProfileField,
    ReportContent,
    RequirementGroup,
    EntityGroup,
    RiskItem,
    SourceRef,
    TableSummary,
)
from app.services.llm_service import llm_service
from app.services.report_corpus_service import (
    format_chunk_for_prompt,
    group_chunks_hierarchically,
)

ProgressCb = Callable[[str], Awaitable[None]] | Callable[[str], None] | None

_WINDOW_CHARS = 9000
_SINGLE_PASS_CHARS = 22000
_MAX_FACTS = 18
_MAX_METRICS = 16
_MAX_MILESTONES = 12
_MAX_REQUIREMENTS_PER_CAT = 6
_MAX_RISKS = 8
_MAX_GAPS = 8
_MAX_CONFLICTS = 8
_MAX_ACTIONS = 10
_MAX_FINDINGS = 6
_MAX_TABLE_ROWS = 6

_DATE_RE = re.compile(
    r"\b("
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|"
    r"Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}"
    r"|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|"
    r"Dec(?:ember)?)\s+\d{4}"
    r"|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}"
    r"|\d{4}-\d{2}-\d{2}"
    r")\b",
    re.I,
)
_METRIC_RE = re.compile(
    r"\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*"
    r"(m³|m3|m²|m2|mm|cm|km|MT|mt|t\b|kg|kN|MPa|kVA|kW|MW|%|"
    r"months?|days?|weeks?|years?|floors?|storeys?|towers?|"
    r"USD|INR|₹|\$)\b",
    re.I,
)
_REV_RE = re.compile(
    r"\b(?:rev(?:ision)?|ver(?:sion)?)\s*[:.\-]?\s*(?:no\.?\s*)?([A-Z0-9][A-Z0-9.\-]{0,12})\b",
    re.I,
)
_PAGE_COUNT_RE = re.compile(
    r"\b(?:total\s+)?(?:pages?|sheets?)\s*[:.\-]?\s*(\d{1,4})\b",
    re.I,
)
_RISK_HINT = re.compile(
    r"\b(risk|hazard|delay|constraint|gap|missing|conflict|inconsistenc|"
    r"non[- ]conform|punch\s*list|hold\s*point|long[- ]lead)\b",
    re.I,
)
_FIGURE_HINT = re.compile(
    r"\b(figure|drawing|diagram|sheet|plan view|elevation|section view|"
    r"schematic|layout)\b",
    re.I,
)
_JSON_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.I)
_STOP = frozenset(
    "a an the of to for and or in on at by from with as is are was were be this that these those".split()
)

EXTRACT_SYSTEM = """You are a document intelligence extractor for BuildLens.
Return ONLY valid JSON. Do not invent facts, dates, people, costs, quantities,
revisions, page numbers, risks, or approvals.
Every extracted item MUST include a "source" integer that matches a [n] citation
in the provided excerpts. If a field is not present in the excerpts, omit it.
If you are unsure, omit the item. Never guess.
Do not convert recommendations into decisions.
Mitigation may only be included when the excerpts document it.
"""

EXTRACT_USER = """Extract grounded findings from these document excerpts.
Citations look like [n] at the start of each excerpt.

Return JSON with this shape (omit empty arrays/fields):
{{
  "profile": {{
    "document_type": {{"value": "", "source": 1}},
    "revision": {{"value": "", "source": 1}},
    "author": {{"value": "", "source": 1}},
    "organization": {{"value": "", "source": 1}},
    "creation_date": {{"value": "", "source": 1}},
    "approval_date": {{"value": "", "source": 1}},
    "effective_date": {{"value": "", "source": 1}},
    "language": {{"value": "", "source": 1}},
    "status": {{"value": "", "source": 1}}
  }},
  "purpose": {{"text": "", "source": 1}},
  "findings": [{{"text": "", "source": 1}}],
  "facts": [{{"attribute": "", "value": "", "source": 1}}],
  "requirements": [{{"category": "STRUCTURAL|ARCHITECTURAL|ELECTRICAL|MEP|FIRE & SAFETY|QUALITY|COMMERCIAL|SCHEDULE|DOCUMENT CONTROL", "text": "", "source": 1}}],
  "metrics": [{{"metric": "", "value": "", "context": "", "source": 1, "calculated": false}}],
  "milestones": [{{"milestone": "", "date": "", "source": 1}}],
  "entities": [{{"category": "Organizations|People|Projects|Systems|Standards|Authorities", "name": "", "source": 1}}],
  "risks": [{{"risk": "", "impact": "", "mitigation": "", "category": "Schedule|Cost|Design|Procurement|Quality|Safety|Technical|Operational|Compliance", "source": 1}}],
  "gaps": [{{"gap": "", "impact": "", "source": 1}}],
  "conflicts": [{{"topic": "", "a": {{"text": "", "source": 1}}, "b": {{"text": "", "source": 2}}}}],
  "actions": [{{"action": "", "owner": "", "due": "", "source": 1}}],
  "decisions": [{{"decision": "", "rationale": "", "source": 1}}],
  "tables": [{{"title": "", "summary": "", "source": 1}}],
  "figures": [{{"title": "", "purpose": "", "sheet": "", "source": 1}}]
}}

Excerpts:
{excerpts}
"""

SYNTH_SYSTEM = """You are a senior report writer for executive audiences. Synthesize EXTRACTED FACTS only into polished, publication-quality prose.
Do not add any fact, date, name, number, or risk that is not in the JSON.
If information is missing, state it is not specified in the uploaded document—never pad with generic filler.
Use confident, precise business English. No throat-clearing or meta commentary.
Return JSON only:
{"executive_summary":"1-2 short paragraphs","purpose":"1-2 paragraphs","top_findings":["..."],"observations":["BuildLens observations only — clearly interpretive, not document claims"],"document_actions":["actions stated in the document"]}
"""


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _tokens(text: str) -> set[str]:
    return {
        t
        for t in re.findall(r"[a-z0-9]{2,}", (text or "").lower())
        if t not in _STOP
    }


def _grounded(value: str, chunk_text: str) -> bool:
    if not value or not chunk_text:
        return False
    v = value.strip()
    if len(v) <= 2:
        return v.lower() in chunk_text.lower()
    if v.lower() in chunk_text.lower():
        return True
    vt = _tokens(v)
    ct = _tokens(chunk_text)
    if not vt:
        return False
    overlap = vt & ct
    if len(vt) <= 3:
        return len(overlap) == len(vt)
    return len(overlap) / len(vt) >= 0.45


def _parse_json(raw: str) -> dict[str, Any] | None:
    text = (raw or "").strip()
    if not text:
        return None
    fence = _JSON_FENCE.search(text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _source_map(chunks: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    mapping: dict[int, dict[str, Any]] = {}
    for chunk in chunks:
        idx = (chunk.get("metadata") or {}).get("source_index")
        if isinstance(idx, int):
            mapping[idx] = chunk
    return mapping


def _valid_source(idx: Any, sources: dict[int, dict[str, Any]]) -> Optional[int]:
    try:
        n = int(idx)
    except (TypeError, ValueError):
        return None
    return n if n in sources else None


def _profile_field(label: str, value: Any, source: Optional[int]) -> ProfileField:
    text = str(value).strip() if value not in (None, "") else ""
    if not text or text.lower() in {"unknown", "n/a", "none", "null"}:
        return ProfileField(label=label, value=NOT_SPECIFIED, evidence=EvidenceLabel.NOT_SPECIFIED)
    return ProfileField(
        label=label,
        value=text,
        source_index=source,
        evidence=EvidenceLabel.DIRECTLY_STATED if source else EvidenceLabel.DERIVED_FROM_DOCUMENT,
    )


class ReportAnalysisService:
    """Map-reduce full-document analysis with citation grounding."""

    async def analyze(
        self,
        chunks: list[dict[str, Any]],
        document_names: list[str],
        *,
        provider: str,
        model: str,
        api_key: Optional[str] = None,
        progress: ProgressCb = None,
        partial: bool = False,
    ) -> ReportContent:
        await self._progress(progress, "Reading document structure...")
        sources = self._build_sources(chunks)
        source_by_index = _source_map(chunks)

        await self._progress(progress, "Extracting key information...")
        deterministic = self._deterministic_extract(chunks, source_by_index)

        llm_extracts: list[dict[str, Any]] = []
        total_chars = sum(len(c.get("content") or "") for c in chunks)
        try:
            if total_chars <= _SINGLE_PASS_CHARS:
                excerpt = "\n\n".join(format_chunk_for_prompt(c) for c in chunks)
                parsed = await self._llm_json(
                    EXTRACT_SYSTEM,
                    EXTRACT_USER.format(excerpts=excerpt),
                    provider,
                    model,
                    api_key,
                )
                if parsed:
                    llm_extracts.append(parsed)
            else:
                windows = self._build_windows(chunks)
                for i, window in enumerate(windows):
                    if i == 0:
                        await self._progress(progress, "Analyzing requirements...")
                    excerpt = "\n\n".join(format_chunk_for_prompt(c) for c in window)
                    parsed = await self._llm_json(
                        EXTRACT_SYSTEM,
                        EXTRACT_USER.format(excerpts=excerpt),
                        provider,
                        model,
                        api_key,
                    )
                    if parsed:
                        llm_extracts.append(parsed)
        except Exception as exc:
            print(f"[report] extraction LLM failed: {exc}")

        await self._progress(progress, "Checking for risks and inconsistencies...")
        merged = self._merge_extracts(llm_extracts, deterministic, source_by_index)
        content = self._to_content(merged, sources, document_names, chunks, source_by_index)
        content.conflicts = self._detect_conflicts(content, source_by_index) + content.conflicts
        content.conflicts = self._dedupe_conflicts(content.conflicts)

        if partial:
            content.limitations = (
                "Report generated from the content currently available. "
                "Some document elements could not be analyzed."
            )

        await self._progress(progress, "Building report...")
        try:
            synth = await self._llm_json(
                SYNTH_SYSTEM,
                "Extracted report JSON:\n" + content.model_dump_json()[:18000],
                provider,
                model,
                api_key,
                max_tokens=1800,
            )
        except Exception as exc:
            print(f"[report] synthesis LLM failed: {exc}")
            synth = None

        if synth:
            summary = str(synth.get("executive_summary") or "").strip()
            purpose = str(synth.get("purpose") or "").strip()
            if summary and self._summary_is_grounded(summary, chunks):
                content.executive_summary = summary
            if purpose and self._summary_is_grounded(purpose, chunks):
                content.purpose = purpose
            findings = synth.get("top_findings") or []
            if isinstance(findings, list) and findings and not content.top_findings:
                for item in findings[:_MAX_FINDINGS]:
                    text = str(item).strip()
                    if text:
                        content.top_findings.append(
                            CitedText(
                                text=text,
                                evidence=EvidenceLabel.DERIVED_FROM_DOCUMENT,
                                priority=Priority.CRITICAL,
                            )
                        )
            observations = synth.get("observations") or []
            if isinstance(observations, list):
                content.observations = [
                    str(o).strip()
                    for o in observations
                    if str(o).strip()
                ][:5]
            doc_actions = synth.get("document_actions") or []
            if isinstance(doc_actions, list) and not content.document_actions:
                content.document_actions = [
                    CitedText(
                        text=str(a).strip(),
                        evidence=EvidenceLabel.DERIVED_FROM_DOCUMENT,
                    )
                    for a in doc_actions
                    if str(a).strip()
                ][:8]

        if not content.executive_summary:
            content.executive_summary = self._fallback_summary(content)
        if not content.purpose:
            content.purpose = (
                "The uploaded document's stated purpose is not specified in the extracted content."
            )
        if not content.top_findings:
            content.top_findings = [
                CitedText(
                    text=f.attribute + ": " + f.value,
                    source_index=f.source_index,
                    evidence=f.evidence,
                    priority=Priority.CRITICAL,
                )
                for f in content.key_facts[:_MAX_FINDINGS]
            ]
        if len(document_names) > 1:
            content.cross_document_findings = [
                c for c in content.conflicts if self._is_cross_document(c, sources)
            ]
        return content

    async def _progress(self, cb: ProgressCb, message: str) -> None:
        if cb is None:
            return
        result = cb(message)
        if hasattr(result, "__await__"):
            await result  # type: ignore[misc]

    async def _llm_json(
        self,
        system: str,
        prompt: str,
        provider: str,
        model: str,
        api_key: Optional[str],
        max_tokens: int = 3500,
    ) -> dict[str, Any] | None:
        raw = await llm_service.generate_text(
            prompt=prompt,
            system=system,
            provider=provider,
            model=model,
            api_key=api_key,
            max_tokens=max_tokens,
        )
        parsed = _parse_json(raw)
        if parsed:
            return parsed
        retry = await llm_service.generate_text(
            prompt="Return JSON only. No markdown.\n\n" + prompt[-6000:],
            system=system,
            provider=provider,
            model=model,
            api_key=api_key,
            max_tokens=max_tokens,
        )
        return _parse_json(retry)

    def _build_windows(self, chunks: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
        groups = group_chunks_hierarchically(chunks)
        windows: list[list[dict[str, Any]]] = []
        current: list[dict[str, Any]] = []
        size = 0
        for group in groups:
            group_chunks = group["chunks"]
            group_size = sum(len(c.get("content") or "") for c in group_chunks)
            if current and size + group_size > _WINDOW_CHARS:
                windows.append(current)
                current, size = [], 0
            if group_size > _WINDOW_CHARS:
                buf: list[dict[str, Any]] = []
                buf_size = 0
                for chunk in group_chunks:
                    clen = len(chunk.get("content") or "")
                    if buf and buf_size + clen > _WINDOW_CHARS:
                        windows.append(buf)
                        buf, buf_size = [], 0
                    buf.append(chunk)
                    buf_size += clen
                if buf:
                    windows.append(buf)
                continue
            current.extend(group_chunks)
            size += group_size
        if current:
            windows.append(current)
        return windows or [chunks]

    def _build_sources(self, chunks: list[dict[str, Any]]) -> list[SourceRef]:
        sources: list[SourceRef] = []
        for chunk in chunks:
            meta = chunk.get("metadata") or {}
            idx = meta.get("source_index")
            if not isinstance(idx, int):
                continue
            snippet = (chunk.get("content") or "").strip().replace("\n", " ")
            sources.append(
                SourceRef(
                    index=idx,
                    document_id=meta.get("document_id"),
                    file_name=meta.get("file_name") or "Unknown",
                    page_number=meta.get("page_number"),
                    section_title=meta.get("section_title"),
                    snippet=snippet[:280],
                    location_label=meta.get("location_label"),
                    chunk_id=chunk.get("chunk_id") or meta.get("chunk_id"),
                    element_type=meta.get("element_type"),
                )
            )
        return sources

    def _deterministic_extract(
        self, chunks: list[dict[str, Any]], sources: dict[int, dict[str, Any]]
    ) -> dict[str, Any]:
        facts: list[dict[str, Any]] = []
        metrics: list[dict[str, Any]] = []
        milestones: list[dict[str, Any]] = []
        figures: list[dict[str, Any]] = []
        tables: list[dict[str, Any]] = []
        risks: list[dict[str, Any]] = []
        profile: dict[str, Any] = {}
        pages: list[int] = []

        for chunk in chunks:
            meta = chunk.get("metadata") or {}
            idx = meta.get("source_index")
            text = chunk.get("content") or ""
            page = meta.get("page_number")
            if isinstance(page, int):
                pages.append(page)
            element = str(meta.get("element_type") or "").lower()

            rev = _REV_RE.search(text)
            if rev and "revision" not in profile:
                profile["revision"] = {"value": rev.group(1), "source": idx}

            for match in _METRIC_RE.finditer(text):
                value = f"{match.group(1)} {match.group(2)}".strip()
                start = max(0, match.start() - 48)
                ctx = re.sub(r"\s+", " ", text[start : match.end() + 24]).strip()
                metrics.append(
                    {
                        "metric": ctx[:80],
                        "value": value,
                        "context": ctx[:120],
                        "source": idx,
                    }
                )

            for match in _DATE_RE.finditer(text):
                date = match.group(1)
                start = max(0, match.start() - 60)
                ctx = re.sub(r"\s+", " ", text[start : match.end()]).strip()
                milestones.append(
                    {"milestone": ctx[:90], "date": date, "source": idx}
                )

            if "picture" in element or "image" in element or "figure" in element:
                title = text.strip().split("\n", 1)[0][:120]
                figures.append({"title": title, "purpose": "", "source": idx})
            elif _FIGURE_HINT.search(text) and text.lower().lstrip().startswith(
                ("figure", "drawing", "sheet")
            ):
                title = text.strip().split("\n", 1)[0][:120]
                figures.append({"title": title, "purpose": "", "source": idx})

            if "table" in element or text.count("|") >= 3:
                title = (meta.get("section_title") or "Table").strip()
                rows = [
                    [c.strip() for c in line.split("|") if c.strip()]
                    for line in text.splitlines()
                    if "|" in line
                ][: _MAX_TABLE_ROWS + 1]
                tables.append(
                    {
                        "title": title[:80],
                        "summary": text[:240],
                        "rows": rows[:_MAX_TABLE_ROWS],
                        "source": idx,
                    }
                )

            if _RISK_HINT.search(text):
                sentence = text.strip().split("\n")[0][:220]
                risks.append(
                    {"risk": sentence, "impact": NOT_SPECIFIED, "source": idx, "category": ""}
                )

        if pages:
            profile["page_count"] = {
                "value": str(max(pages)),
                "source": None,
                "derived": True,
            }

        return {
            "profile": profile,
            "facts": facts,
            "metrics": metrics[:40],
            "milestones": milestones[:30],
            "figures": figures[:12],
            "tables": tables[:8],
            "risks": risks[:12],
        }

    def _merge_extracts(
        self,
        llm_extracts: list[dict[str, Any]],
        deterministic: dict[str, Any],
        sources: dict[int, dict[str, Any]],
    ) -> dict[str, Any]:
        merged: dict[str, Any] = {
            "profile": dict(deterministic.get("profile") or {}),
            "purpose": None,
            "findings": [],
            "facts": list(deterministic.get("facts") or []),
            "requirements": [],
            "metrics": list(deterministic.get("metrics") or []),
            "milestones": list(deterministic.get("milestones") or []),
            "entities": [],
            "risks": list(deterministic.get("risks") or []),
            "gaps": [],
            "conflicts": [],
            "actions": [],
            "decisions": [],
            "tables": list(deterministic.get("tables") or []),
            "figures": list(deterministic.get("figures") or []),
        }
        for block in llm_extracts:
            if not isinstance(block, dict):
                continue
            profile = block.get("profile") or {}
            if isinstance(profile, dict):
                for key, val in profile.items():
                    if key in merged["profile"] or not isinstance(val, dict):
                        continue
                    src = _valid_source(val.get("source"), sources)
                    value = str(val.get("value") or "").strip()
                    if src and value and _grounded(value, sources[src].get("content") or ""):
                        merged["profile"][key] = {"value": value, "source": src}
            purpose = block.get("purpose")
            if isinstance(purpose, dict) and not merged["purpose"]:
                src = _valid_source(purpose.get("source"), sources)
                text = str(purpose.get("text") or "").strip()
                if src and text and _grounded(text, sources[src].get("content") or ""):
                    merged["purpose"] = {"text": text, "source": src}
            for key in (
                "findings",
                "facts",
                "requirements",
                "metrics",
                "milestones",
                "entities",
                "risks",
                "gaps",
                "conflicts",
                "actions",
                "decisions",
                "tables",
                "figures",
            ):
                items = block.get(key) or []
                if isinstance(items, list):
                    merged[key].extend(items)
        return merged

    def _to_content(
        self,
        merged: dict[str, Any],
        sources: list[SourceRef],
        document_names: list[str],
        chunks: list[dict[str, Any]],
        source_by_index: dict[int, dict[str, Any]],
    ) -> ReportContent:
        profile_raw = merged.get("profile") or {}
        profile = DocumentProfile()
        name = document_names[0] if len(document_names) == 1 else (
            f"{len(document_names)} selected documents" if document_names else NOT_SPECIFIED
        )
        profile.name = ProfileField(
            label="Document name",
            value=name,
            evidence=EvidenceLabel.DIRECTLY_STATED,
        )
        mapping = {
            "document_type": profile.document_type,
            "revision": profile.revision,
            "author": profile.author,
            "organization": profile.organization,
            "creation_date": profile.creation_date,
            "approval_date": profile.approval_date,
            "effective_date": profile.effective_date,
            "language": profile.language,
            "status": profile.status,
            "page_count": profile.page_count,
        }
        for key, field in mapping.items():
            raw = profile_raw.get(key)
            if isinstance(raw, dict) and raw.get("value"):
                src = _valid_source(raw.get("source"), source_by_index)
                evidence = (
                    EvidenceLabel.DERIVED_FROM_DOCUMENT
                    if raw.get("derived")
                    else EvidenceLabel.DIRECTLY_STATED
                )
                setattr(
                    profile,
                    key,
                    ProfileField(
                        label=field.label,
                        value=str(raw["value"]),
                        source_index=src,
                        evidence=evidence if src or raw.get("derived") else EvidenceLabel.NOT_SPECIFIED,
                    ),
                )

        facts: list[FactRow] = []
        seen_facts: set[str] = set()
        for item in merged.get("facts") or []:
            if not isinstance(item, dict):
                continue
            attr = str(item.get("attribute") or "").strip()
            value = str(item.get("value") or "").strip()
            src = _valid_source(item.get("source"), source_by_index)
            if not attr or not value or not src:
                continue
            if not _grounded(value, source_by_index[src].get("content") or ""):
                continue
            key = _norm(attr) + "|" + _norm(value)
            if key in seen_facts:
                continue
            seen_facts.add(key)
            facts.append(
                FactRow(
                    attribute=attr[:80],
                    value=value[:120],
                    source_index=src,
                    evidence=EvidenceLabel.DIRECTLY_STATED,
                )
            )
            if len(facts) >= _MAX_FACTS:
                break

        metrics: list[MetricRow] = []
        seen_metrics: set[str] = set()
        for item in merged.get("metrics") or []:
            if not isinstance(item, dict):
                continue
            metric = str(item.get("metric") or item.get("context") or "").strip()
            value = str(item.get("value") or "").strip()
            src = _valid_source(item.get("source"), source_by_index)
            if not value or not src:
                continue
            if not _grounded(value, source_by_index[src].get("content") or ""):
                continue
            key = _norm(value) + "|" + _norm(metric)[:40]
            if key in seen_metrics:
                continue
            seen_metrics.add(key)
            calculated = bool(item.get("calculated"))
            metrics.append(
                MetricRow(
                    metric=(metric or "Metric")[:80],
                    value=value[:80],
                    context=str(item.get("context") or "")[:120],
                    source_index=src,
                    evidence=(
                        EvidenceLabel.DERIVED_FROM_DOCUMENT
                        if calculated
                        else EvidenceLabel.DIRECTLY_STATED
                    ),
                    calculated=calculated,
                )
            )
            if len(metrics) >= _MAX_METRICS:
                break

        req_groups: dict[str, list[CitedText]] = defaultdict(list)
        for item in merged.get("requirements") or []:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            src = _valid_source(item.get("source"), source_by_index)
            if not text or not src or not _grounded(text, source_by_index[src].get("content") or ""):
                continue
            cat = str(item.get("category") or "General").strip().upper() or "GENERAL"
            if len(req_groups[cat]) >= _MAX_REQUIREMENTS_PER_CAT:
                continue
            req_groups[cat].append(
                CitedText(text=text[:240], source_index=src, evidence=EvidenceLabel.DIRECTLY_STATED)
            )

        milestones: list[MilestoneRow] = []
        seen_ms: set[str] = set()
        for item in merged.get("milestones") or []:
            if not isinstance(item, dict):
                continue
            date = str(item.get("date") or "").strip()
            label = str(item.get("milestone") or "").strip() or "Milestone"
            src = _valid_source(item.get("source"), source_by_index)
            if not date or not src:
                continue
            if not _grounded(date, source_by_index[src].get("content") or ""):
                continue
            key = _norm(date) + "|" + _norm(label)[:40]
            if key in seen_ms:
                continue
            seen_ms.add(key)
            milestones.append(
                MilestoneRow(
                    milestone=label[:100],
                    date=date[:40],
                    source_index=src,
                    evidence=EvidenceLabel.DIRECTLY_STATED,
                )
            )
            if len(milestones) >= _MAX_MILESTONES:
                break

        entity_groups: dict[str, list[CitedText]] = defaultdict(list)
        seen_ent: set[str] = set()
        for item in merged.get("entities") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            src = _valid_source(item.get("source"), source_by_index)
            if not name or not src or not _grounded(name, source_by_index[src].get("content") or ""):
                continue
            cat = str(item.get("category") or "Entities").strip() or "Entities"
            key = _norm(cat) + "|" + _norm(name)
            if key in seen_ent:
                continue
            seen_ent.add(key)
            entity_groups[cat].append(
                CitedText(text=name[:120], source_index=src, evidence=EvidenceLabel.DIRECTLY_STATED)
            )

        risks: list[RiskItem] = []
        seen_risks: set[str] = set()
        for item in merged.get("risks") or []:
            if not isinstance(item, dict):
                continue
            risk = str(item.get("risk") or "").strip()
            src = _valid_source(item.get("source"), source_by_index)
            if not risk or not src or not _grounded(risk, source_by_index[src].get("content") or ""):
                continue
            key = _norm(risk)[:80]
            if key in seen_risks:
                continue
            seen_risks.add(key)
            mitigation = str(item.get("mitigation") or "").strip()
            mit_ok = bool(
                mitigation
                and src
                and _grounded(mitigation, source_by_index[src].get("content") or "")
            )
            risks.append(
                RiskItem(
                    risk=risk[:220],
                    impact=str(item.get("impact") or NOT_SPECIFIED)[:180],
                    mitigation=mitigation[:180] if mit_ok else NOT_SPECIFIED,
                    category=str(item.get("category") or "")[:40],
                    source_index=src,
                    evidence=EvidenceLabel.DIRECTLY_STATED,
                    priority=Priority.CRITICAL,
                )
            )
            if len(risks) >= _MAX_RISKS:
                break

        gaps: list[GapItem] = []
        for item in merged.get("gaps") or []:
            if not isinstance(item, dict):
                continue
            gap = str(item.get("gap") or "").strip()
            if not gap:
                continue
            src = _valid_source(item.get("source"), source_by_index)
            gaps.append(
                GapItem(
                    gap=gap[:240],
                    impact=str(item.get("impact") or "")[:180],
                    source_index=src,
                    evidence=EvidenceLabel.POTENTIAL_GAP,
                )
            )
            if len(gaps) >= _MAX_GAPS:
                break

        conflicts: list[ConflictItem] = []
        for item in merged.get("conflicts") or []:
            if not isinstance(item, dict):
                continue
            topic = str(item.get("topic") or "").strip()
            statements: list[CitedText] = []
            for side in ("a", "b"):
                raw = item.get(side)
                if not isinstance(raw, dict):
                    continue
                text = str(raw.get("text") or "").strip()
                src = _valid_source(raw.get("source"), source_by_index)
                if text and src and _grounded(text, source_by_index[src].get("content") or ""):
                    statements.append(
                        CitedText(
                            text=text[:200],
                            source_index=src,
                            evidence=EvidenceLabel.CONFLICTING_INFORMATION,
                        )
                    )
            if topic and len(statements) >= 2:
                conflicts.append(
                    ConflictItem(topic=topic[:120], statements=statements, priority=Priority.CRITICAL)
                )
            if len(conflicts) >= _MAX_CONFLICTS:
                break

        actions: list[ActionRow] = []
        for item in merged.get("actions") or []:
            if not isinstance(item, dict):
                continue
            action = str(item.get("action") or "").strip()
            src = _valid_source(item.get("source"), source_by_index)
            if not action or not src or not _grounded(action, source_by_index[src].get("content") or ""):
                continue
            owner = str(item.get("owner") or "").strip()
            due = str(item.get("due") or "").strip()
            owner_ok = bool(owner and _grounded(owner, source_by_index[src].get("content") or ""))
            due_ok = bool(due and _grounded(due, source_by_index[src].get("content") or ""))
            actions.append(
                ActionRow(
                    action=action[:200],
                    owner=owner if owner_ok else "Not specified",
                    due=due if due_ok else "Not specified",
                    source_index=src,
                )
            )
            if len(actions) >= _MAX_ACTIONS:
                break

        decisions: list[DecisionItem] = []
        for item in merged.get("decisions") or []:
            if not isinstance(item, dict):
                continue
            decision = str(item.get("decision") or "").strip()
            src = _valid_source(item.get("source"), source_by_index)
            if not decision or not src or not _grounded(decision, source_by_index[src].get("content") or ""):
                continue
            rationale = str(item.get("rationale") or "").strip()
            rat_ok = bool(rationale and _grounded(rationale, source_by_index[src].get("content") or ""))
            decisions.append(
                DecisionItem(
                    decision=decision[:220],
                    rationale=rationale[:200] if rat_ok else NOT_SPECIFIED,
                    source_index=src,
                )
            )

        tables: list[TableSummary] = []
        for item in merged.get("tables") or []:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "Table").strip()
            src = _valid_source(item.get("source"), source_by_index)
            rows = item.get("rows") if isinstance(item.get("rows"), list) else []
            clean_rows = []
            for row in rows[:_MAX_TABLE_ROWS]:
                if isinstance(row, list):
                    clean_rows.append([str(c)[:60] for c in row[:6]])
            tables.append(
                TableSummary(
                    title=title[:80],
                    summary=str(item.get("summary") or "")[:240],
                    rows=clean_rows,
                    source_index=src,
                    priority=Priority.MEDIUM,
                )
            )
            if len(tables) >= 5:
                break

        figures: list[FigureRef] = []
        for item in merged.get("figures") or []:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            src = _valid_source(item.get("source"), source_by_index)
            if not title:
                continue
            figures.append(
                FigureRef(
                    title=title[:120],
                    purpose=str(item.get("purpose") or NOT_SPECIFIED)[:180],
                    sheet=str(item.get("sheet") or "") or None,
                    source_index=src,
                    description=str(item.get("description") or "")[:180],
                )
            )
            if len(figures) >= 6:
                break

        findings: list[CitedText] = []
        for item in merged.get("findings") or []:
            if isinstance(item, dict):
                text = str(item.get("text") or "").strip()
                src = _valid_source(item.get("source"), source_by_index)
            else:
                text = str(item).strip()
                src = None
            if not text:
                continue
            if src and not _grounded(text, source_by_index[src].get("content") or ""):
                src = None
            findings.append(
                CitedText(
                    text=text[:240],
                    source_index=src,
                    evidence=EvidenceLabel.DIRECTLY_STATED if src else EvidenceLabel.DERIVED_FROM_DOCUMENT,
                    priority=Priority.CRITICAL,
                )
            )
            if len(findings) >= _MAX_FINDINGS:
                break

        purpose_raw = merged.get("purpose") or {}
        purpose_text = ""
        if isinstance(purpose_raw, dict):
            purpose_text = str(purpose_raw.get("text") or "").strip()

        title = "BuildLens Document Report"
        if len(document_names) == 1:
            title = f"BuildLens Document Report — {document_names[0]}"
        elif document_names:
            title = f"BuildLens Document Report — {len(document_names)} documents"

        return ReportContent(
            title=title,
            document_names=document_names,
            document_count=len(document_names),
            purpose=purpose_text,
            top_findings=findings,
            document_profile=profile,
            key_facts=facts,
            requirements=[
                RequirementGroup(category=cat, items=items)
                for cat, items in req_groups.items()
                if items
            ],
            metrics=metrics,
            milestones=milestones if milestones else [],
            entities=[
                EntityGroup(category=cat, items=items)
                for cat, items in entity_groups.items()
                if items
            ],
            tables=tables,
            figures=figures,
            risks=risks,
            gaps=gaps,
            conflicts=conflicts,
            actions=actions,
            decisions=decisions,
            sources=sources,
        )

    def _detect_conflicts(
        self, content: ReportContent, sources: dict[int, dict[str, Any]]
    ) -> list[ConflictItem]:
        found: list[ConflictItem] = []
        by_attr: dict[str, list[FactRow]] = defaultdict(list)
        for fact in content.key_facts:
            by_attr[_norm(fact.attribute)].append(fact)
        for attr, rows in by_attr.items():
            values = {_norm(r.value) for r in rows}
            if len(values) < 2:
                continue
            statements = [
                CitedText(
                    text=f"{r.attribute}: {r.value}",
                    source_index=r.source_index,
                    evidence=EvidenceLabel.CONFLICTING_INFORMATION,
                )
                for r in rows[:4]
            ]
            found.append(
                ConflictItem(
                    topic=rows[0].attribute,
                    statements=statements,
                    status="Requires clarification.",
                    priority=Priority.CRITICAL,
                )
            )
            for row in rows:
                row.evidence = EvidenceLabel.CONFLICTING_INFORMATION

        by_metric: dict[str, list[MetricRow]] = defaultdict(list)
        for metric in content.metrics:
            key = _norm(re.sub(r"\d[\d,.\s]*", "", metric.metric))[:40] or _norm(metric.metric)[:40]
            if key:
                by_metric[key].append(metric)
        for _, rows in by_metric.items():
            values = {_norm(r.value) for r in rows}
            if len(values) < 2:
                continue
            found.append(
                ConflictItem(
                    topic=rows[0].metric,
                    statements=[
                        CitedText(
                            text=f"{r.metric}: {r.value}",
                            source_index=r.source_index,
                            evidence=EvidenceLabel.CONFLICTING_INFORMATION,
                        )
                        for r in rows[:4]
                    ],
                    status="Requires clarification.",
                    priority=Priority.CRITICAL,
                )
            )
        return found[:_MAX_CONFLICTS]

    def _dedupe_conflicts(self, items: list[ConflictItem]) -> list[ConflictItem]:
        seen: set[str] = set()
        out: list[ConflictItem] = []
        for item in items:
            key = _norm(item.topic)
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
        return out[:_MAX_CONFLICTS]

    def _is_cross_document(self, conflict: ConflictItem, sources: list[SourceRef]) -> bool:
        by_index = {s.index: s.document_id for s in sources}
        docs = {
            by_index.get(s.source_index)
            for s in conflict.statements
            if s.source_index is not None
        }
        docs.discard(None)
        return len(docs) > 1

    def _summary_is_grounded(self, text: str, chunks: list[dict[str, Any]]) -> bool:
        tokens = _tokens(text)
        if len(tokens) < 8:
            return True
        corpus = " ".join(c.get("content") or "" for c in chunks).lower()
        corpus_tokens = _tokens(corpus)
        overlap = tokens & corpus_tokens
        return (len(overlap) / max(len(tokens), 1)) >= 0.28

    def _fallback_summary(self, content: ReportContent) -> str:
        names = ", ".join(content.document_names) or "the selected document"
        bits = [f"This report analyses {names} from the uploaded source text."]
        if content.key_facts:
            bits.append(
                "Key documented facts include "
                + "; ".join(f"{f.attribute} {f.value}" for f in content.key_facts[:4])
                + "."
            )
        else:
            bits.append(
                "Limited structured facts were explicitly stated in the extracted content."
            )
        if content.risks:
            bits.append(f"{len(content.risks)} documented risk(s) were identified from the source.")
        return " ".join(bits)


report_analysis_service = ReportAnalysisService()
