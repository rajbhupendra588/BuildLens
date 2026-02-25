"""
Intent classification for DocRAG.

Three-layer hybrid detection — purely in-memory, zero I/O, zero added latency:
  Layer 1: Source metadata signals  (strongest weight)
  Layer 2: Keyword/regex pattern banks per mode
  Layer 3: Context-fallback rules
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class IntentMode(str, Enum):
    GENERAL = "GENERAL"
    DOCUMENT_ANALYST = "DOCUMENT_ANALYST"
    CODE_ARCHITECT = "CODE_ARCHITECT"
    CODE_DEBUGGER = "CODE_DEBUGGER"
    SUMMARIZER = "SUMMARIZER"
    DATA_ANALYST = "DATA_ANALYST"
    CREATIVE = "CREATIVE"


# Priority order for tie-breaking (first = highest priority)
_PRIORITY: List[IntentMode] = [
    IntentMode.CODE_DEBUGGER,
    IntentMode.CODE_ARCHITECT,
    IntentMode.DATA_ANALYST,
    IntentMode.SUMMARIZER,
    IntentMode.CREATIVE,
    IntentMode.DOCUMENT_ANALYST,
    IntentMode.GENERAL,
]

_LABELS: Dict[IntentMode, str] = {
    IntentMode.GENERAL: "General Assistant",
    IntentMode.DOCUMENT_ANALYST: "Document Analyst",
    IntentMode.CODE_ARCHITECT: "Code Architect",
    IntentMode.CODE_DEBUGGER: "Code Debugger",
    IntentMode.SUMMARIZER: "Summarizer",
    IntentMode.DATA_ANALYST: "Data Analyst",
    IntentMode.CREATIVE: "Creative Synthesizer",
}

_ICONS: Dict[IntentMode, str] = {
    IntentMode.GENERAL: "✨",
    IntentMode.DOCUMENT_ANALYST: "📄",
    IntentMode.CODE_ARCHITECT: "💻",
    IntentMode.CODE_DEBUGGER: "🐛",
    IntentMode.SUMMARIZER: "📋",
    IntentMode.DATA_ANALYST: "📊",
    IntentMode.CREATIVE: "💡",
}

# Activation threshold — total score must exceed this to be considered "activated"
_THRESHOLD = 4

# ---------------------------------------------------------------------------
# Pattern banks: (compiled_regex, weight)
# ---------------------------------------------------------------------------
_PATTERNS: Dict[IntentMode, List[tuple]] = {
    IntentMode.CODE_DEBUGGER: [
        (re.compile(r"\b(bug|bugs|buggy)\b", re.I), 3),
        (re.compile(r"\b(error|errors)\b", re.I), 2),
        (re.compile(r"\b(fix|fixes|fixing)\b", re.I), 2),
        (re.compile(r"\b(not\s+working|doesn'?t\s+work|broken|crash(?:es|ing)?|hang(?:s|ing)?)\b", re.I), 3),
        (re.compile(r"\b(debug(?:ging)?|trace(?:back)?|stacktrace)\b", re.I), 3),
        (re.compile(r"\b(exception|raises?|throws?|thrown)\b", re.I), 3),
        (re.compile(r"\b(TypeError|ValueError|KeyError|AttributeError|ImportError|RuntimeError|NameError|IndexError|ZeroDivisionError|SyntaxError|OSError|IOError|FileNotFoundError|PermissionError|StopIteration|AssertionError|NotImplementedError|OverflowError|MemoryError|RecursionError)\b", re.I), 4),
        (re.compile(r"\b(why\s+is|why\s+does|why\s+won'?t|what'?s\s+wrong|what\s+is\s+wrong)\b", re.I), 2),
        (re.compile(r"\b(null\s+pointer|segfault|segmentation\s+fault|undefined\s+reference|linker\s+error|compilation\s+error)\b", re.I), 4),
        (re.compile(r"\b(failing|failed|fail)\b", re.I), 2),
    ],
    IntentMode.CODE_ARCHITECT: [
        (re.compile(r"\b(explain\s+(the\s+)?(code|class|function|method|module|architecture|design|pattern))\b", re.I), 4),
        (re.compile(r"\b(how\s+does\s+(this|the)\s+(code|class|function|method|system|module|architecture)\s+work)\b", re.I), 4),
        (re.compile(r"\b(architecture|architectures)\b", re.I), 3),
        (re.compile(r"\b(refactor|refactoring|restructure|redesign)\b", re.I), 3),
        (re.compile(r"\b(design\s+pattern|design\s+patterns|solid\s+principles?|dependency\s+inject|inversion\s+of\s+control)\b", re.I), 4),
        (re.compile(r"\b(what\s+does\s+(this|the)\s+(code|class|function|method)\s+do)\b", re.I), 4),
        (re.compile(r"\b(implement(?:ation)?|implementation\s+of|how\s+(?:is|was)\s+(?:this|that)\s+(?:built|implemented|coded))\b", re.I), 2),
        (re.compile(r"\b(codebase|code\s+structure|module\s+structure|class\s+hierarchy|inheritance|polymorphism)\b", re.I), 3),
        (re.compile(r"\b(function|method|class|interface|abstract|mixin|decorator|middleware|handler|controller|service|repository|factory|singleton|adapter|facade|observer|strategy|command|iterator|template)\b", re.I), 1),
    ],
    IntentMode.DATA_ANALYST: [
        (re.compile(r"\b(average|mean|median|mode|standard\s+deviation|std\s+dev|variance)\b", re.I), 3),
        (re.compile(r"\b(trend|trends|trending)\b", re.I), 2),
        (re.compile(r"\b(how\s+many|how\s+much|count|total|sum|minimum|maximum|min|max)\b", re.I), 3),
        (re.compile(r"\b(statistics?|statistical|analytics?)\b", re.I), 3),
        (re.compile(r"\b(correlation|regression|distribution|histogram|percentile|quartile)\b", re.I), 4),
        (re.compile(r"\b(chart|graph|plot|visuali[sz]e?|dashboard)\b", re.I), 2),
        (re.compile(r"\b(dataset|data\s+set|row[s]?|column[s]?|field[s]?|record[s]?|entry|entries)\b", re.I), 2),
        (re.compile(r"\b(compare|comparison|versus|vs\.?|difference\s+between)\b", re.I), 2),
        (re.compile(r"\b(ratio|proportion|percentage|percent|%)\b", re.I), 2),
    ],
    IntentMode.SUMMARIZER: [
        (re.compile(r"\b(summar(?:y|ize|ize\s+the|ise|isation))\b", re.I), 5),
        (re.compile(r"\b(tl;?dr|tldr)\b", re.I), 5),
        (re.compile(r"\b(key\s+(points?|takeaways?|ideas?|findings?|conclusions?|highlights?))\b", re.I), 4),
        (re.compile(r"\b(overview|brief|briefly|in\s+a\s+nutshell|in\s+short|short\s+version|concise|concisely)\b", re.I), 3),
        (re.compile(r"\b(what\s+(are\s+(the\s+)?)?(main|key|core|important|critical|essential|primary|major)\s+(points?|ideas?|takeaways?|themes?|topics?|aspects?))\b", re.I), 4),
        (re.compile(r"\b(recap|recapitulate|highlight[s]?)\b", re.I), 3),
        (re.compile(r"\b(abstract|executive\s+summary|digest)\b", re.I), 4),
    ],
    IntentMode.CREATIVE: [
        (re.compile(r"\b(brainstorm|brainstorming)\b", re.I), 5),
        (re.compile(r"\b(ideas?|ideation)\b", re.I), 2),
        (re.compile(r"\b(what\s+if|hypothetically|imagine|envision)\b", re.I), 3),
        (re.compile(r"\b(creative|creatively|creative\s+(approach|solution|idea))\b", re.I), 4),
        (re.compile(r"\b(alternatives?|alternative\s+(approach|solution|way))\b", re.I), 3),
        (re.compile(r"\b(innovative|innovation|novel|original|out-of-the-box|outside\s+the\s+box)\b", re.I), 3),
        (re.compile(r"\b(possibilities|possibilities|explore|exploring)\b", re.I), 2),
        (re.compile(r"\b(suggest|suggestions?|propose|proposal|recommend(?:ation)?)\b", re.I), 2),
    ],
    IntentMode.DOCUMENT_ANALYST: [
        (re.compile(r"\b(according\s+to|based\s+on\s+the\s+document|as\s+stated\s+in|the\s+document\s+(says?|states?|mentions?|notes?))\b", re.I), 4),
        (re.compile(r"\b(analyz[e|ing]|analyse|analysis|examine|examining)\b", re.I), 3),
        (re.compile(r"\b(document|documents?|report|reports?|paper|papers?|article|articles?|research|findings?)\b", re.I), 2),
        (re.compile(r"\b(cited?\s+in|reference[sd]?|citation)\b", re.I), 3),
        (re.compile(r"\b(section|chapter|paragraph|clause|appendix)\b", re.I), 2),
        (re.compile(r"\b(policy|policies|regulation[s]?|guideline[s]?|standard[s]?|procedure[s]?)\b", re.I), 2),
        (re.compile(r"\b(what\s+does\s+the\s+(document|report|paper|text|file|article)\s+(say|state|mention|indicate|show))\b", re.I), 4),
    ],
    IntentMode.GENERAL: [],  # No patterns needed — GENERAL is the default fallback
}


@dataclass
class IntentResult:
    mode: IntentMode
    label: str
    icon: str
    confidence: float  # 0.0–1.0 normalized score
    has_context: bool  # True when context_chunks were retrieved
    signals: List[str] = field(default_factory=list)


class IntentClassifier:
    """
    Pure-Python intent classifier with zero I/O and zero added latency.

    Usage:
        result = intent_classifier.classify(query, source_metadata)
    """

    def classify(
        self,
        query: str,
        source_metadata: Optional[List[Dict[str, Any]]] = None,
    ) -> IntentResult:
        """
        Classify the intent of a query given retrieved source metadata.

        Args:
            query: The user's question/message.
            source_metadata: List of metadata dicts from retrieved chunks.
                Each dict may contain: file_name, language, element_type, etc.

        Returns:
            IntentResult with mode, label, icon, confidence, has_context, signals.
        """
        if source_metadata is None:
            source_metadata = []

        has_context = len(source_metadata) > 0
        scores: Dict[IntentMode, float] = {m: 0.0 for m in IntentMode}
        signals: List[str] = []

        # ── Layer 1: Source metadata signals ─────────────────────────────────
        for meta in source_metadata:
            language = (meta.get("language") or "").strip()
            file_name = (meta.get("file_name") or "").lower()
            element_type = (meta.get("element_type") or "").lower()

            if language:
                scores[IntentMode.CODE_ARCHITECT] += 5
                scores[IntentMode.CODE_DEBUGGER] += 3
                signals.append(f"code language: {language}")

            ext = file_name.rsplit(".", 1)[-1] if "." in file_name else ""
            if ext in ("csv", "xlsx", "xls"):
                scores[IntentMode.DATA_ANALYST] += 6
                signals.append(f"tabular file: .{ext}")

            if "table" in element_type:
                scores[IntentMode.DATA_ANALYST] += 3
                signals.append("table element in chunk")

        # ── Layer 2: Keyword/regex pattern banks ──────────────────────────────
        for mode, patterns in _PATTERNS.items():
            for pattern, weight in patterns:
                if pattern.search(query):
                    scores[mode] += weight
                    signals.append(f"{mode.value}: +{weight} ({pattern.pattern[:40]})")

        # ── Layer 3: Context-fallback rules ───────────────────────────────────
        # Find the best activated mode (score >= threshold)
        activated = {
            m: s for m, s in scores.items()
            if m != IntentMode.GENERAL and s >= _THRESHOLD
        }

        if not activated:
            # No strong signal → GENERAL
            chosen = IntentMode.GENERAL
            confidence = 0.1 if not has_context else 0.2
        else:
            # Tie-break by priority order
            chosen = next(m for m in _PRIORITY if m in activated)
            top_score = activated[chosen]
            # Normalize confidence: clamp to [0.5, 1.0]
            confidence = min(1.0, 0.5 + top_score / 20.0)

        return IntentResult(
            mode=chosen,
            label=_LABELS[chosen],
            icon=_ICONS[chosen],
            confidence=confidence,
            has_context=has_context,
            signals=signals,
        )


intent_classifier = IntentClassifier()
