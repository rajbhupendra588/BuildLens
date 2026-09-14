"""
Slash commands for BuildLens chat (e.g. /briefingdoc, /studyguide, /infographic).

Parsed before retrieval and intent classification. The user's message text
is stored as typed; retrieval and LLM user turns may use derived queries.
"""

import re
from dataclasses import dataclass
from typing import Optional, Tuple

from app.services.intent_service import IntentMode

SlashSpec = Tuple[
    re.Pattern[str],
    IntentMode,
    str,
    str,
    str,
]

_BRIEFINGDOC = re.compile(
    r"^\s*/briefingdoc(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)
_STUDYGUIDE = re.compile(
    r"^\s*/studyguide(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)
_INFOGRAPHIC = re.compile(
    r"^\s*/infographic(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)

_BRIEFINGDOC_RETRIEVAL_FALLBACK = (
    "executive summary key findings critical details themes deadlines "
    "action items next steps obligations risks recommendations timeline"
)
_BRIEFINGDOC_LLM_FALLBACK = (
    "Convert my active sources into a structured Briefing Document. "
    "Use only files attached to this conversation and the retrieved document context."
)

_STUDYGUIDE_RETRIEVAL_FALLBACK = (
    "core concepts definitions terminology key terms modules outline "
    "learning objectives summary principles examples practice quiz"
)
_STUDYGUIDE_LLM_FALLBACK = (
    "Analyze my active sources and generate a comprehensive Study Guide. "
    "Use only files attached to this conversation and the retrieved document context."
)

_INFOGRAPHIC_RETRIEVAL_FALLBACK = (
    "key metrics statistics figures timeline process flow phases steps "
    "summary highlights core concepts outcomes trends comparison milestones"
)
_INFOGRAPHIC_LLM_FALLBACK = (
    "Synthesize my active sources into a highly scannable infographic and visual summary. "
    "Use only files attached to this conversation and the retrieved document context."
)

_SLASH_COMMANDS: Tuple[SlashSpec, ...] = (
    (
        _BRIEFINGDOC,
        IntentMode.BRIEFING_DOC,
        "briefingdoc",
        _BRIEFINGDOC_RETRIEVAL_FALLBACK,
        _BRIEFINGDOC_LLM_FALLBACK,
    ),
    (
        _STUDYGUIDE,
        IntentMode.STUDY_GUIDE,
        "studyguide",
        _STUDYGUIDE_RETRIEVAL_FALLBACK,
        _STUDYGUIDE_LLM_FALLBACK,
    ),
    (
        _INFOGRAPHIC,
        IntentMode.INFOGRAPHIC,
        "infographic",
        _INFOGRAPHIC_RETRIEVAL_FALLBACK,
        _INFOGRAPHIC_LLM_FALLBACK,
    ),
)


@dataclass(frozen=True)
class SlashCommandParse:
    """Result of parsing a user message for slash commands."""

    forced_mode: Optional[IntentMode]
    retrieval_query: str
    llm_user_message: str
    command: Optional[str] = None


def parse_slash_command(message: str) -> SlashCommandParse:
    """
    Detect supported slash commands at the start of a message.

    Returns the original message unchanged when no command matches.
    """
    text = message or ""
    stripped = text.strip()

    for pattern, mode, command_name, retrieval_fallback, llm_fallback in _SLASH_COMMANDS:
        match = pattern.match(stripped)
        if not match:
            continue
        remainder = (match.group(1) or "").strip()
        retrieval = remainder or retrieval_fallback
        llm_user = remainder or llm_fallback
        return SlashCommandParse(
            forced_mode=mode,
            retrieval_query=retrieval,
            llm_user_message=llm_user,
            command=command_name,
        )

    return SlashCommandParse(
        forced_mode=None,
        retrieval_query=text,
        llm_user_message=text,
        command=None,
    )


def is_briefingdoc_command(message: str) -> bool:
    return _BRIEFINGDOC.match((message or "").strip()) is not None


def is_studyguide_command(message: str) -> bool:
    return _STUDYGUIDE.match((message or "").strip()) is not None


def is_infographic_command(message: str) -> bool:
    return _INFOGRAPHIC.match((message or "").strip()) is not None
