"""
Slash commands for BuildLens chat (e.g. /report, /briefingdoc, /studyguide).

Parsed before retrieval and intent classification. The user's message text
is stored as typed; retrieval and LLM user turns may use derived queries.
"""

import re
from dataclasses import dataclass
from typing import Optional, Tuple

from app.services.intent_service import IntentMode

_EXCELLENCE_USER_DIRECTIVE = (
    " Deliver a complete, executive-grade response using the required structure. "
    "No empty sections, no informal labels, no meta commentary about commands or tools."
)

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
_DASHBOARD = re.compile(
    r"^\s*/dashboard(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)
_REPORT = re.compile(
    r"^\s*/report(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)
_RISKREGISTER = re.compile(
    r"^\s*/riskregister(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)
_ACTIONPLAN = re.compile(
    r"^\s*/actionplan(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)
_TIMELINE = re.compile(
    r"^\s*/timeline(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)
_FAQ = re.compile(
    r"^\s*/faq(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)
_CONFLICTS = re.compile(
    r"^\s*/conflicts(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)
_SUMMARIZE = re.compile(
    r"^\s*/summarize(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)
_SEARCH = re.compile(
    r"^\s*/search(?:@\w+)?\s*(.*)$",
    re.I | re.DOTALL,
)

_BRIEFINGDOC_RETRIEVAL_FALLBACK = (
    "executive summary key findings critical details themes deadlines "
    "action items next steps obligations risks recommendations timeline"
)
_BRIEFINGDOC_LLM_FALLBACK = (
    "Produce a leadership-ready Briefing Document from my sources with every required section "
    "fully populated and strictly grounded in retrieved context."
    + _EXCELLENCE_USER_DIRECTIVE
)

_STUDYGUIDE_RETRIEVAL_FALLBACK = (
    "core concepts definitions terminology key terms modules outline "
    "learning objectives summary principles examples practice quiz"
)
_STUDYGUIDE_LLM_FALLBACK = (
    "Produce a comprehensive, student-ready Study Guide from my sources with outline, "
    "glossary, quiz, and answer key—all grounded in retrieved context."
    + _EXCELLENCE_USER_DIRECTIVE
)

_INFOGRAPHIC_RETRIEVAL_FALLBACK = (
    "key metrics statistics figures timeline process flow phases steps "
    "summary highlights core concepts outcomes trends comparison milestones"
)
_INFOGRAPHIC_LLM_FALLBACK = (
    "Synthesize my sources into a rich, grounded visual infographic JSON: narrative depth, "
    "KPIs, charts where numbers exist, process or timeline, and actionable takeaways."
    + _EXCELLENCE_USER_DIRECTIVE
)

_DASHBOARD_RETRIEVAL_FALLBACK = (
    "key metrics statistics figures percentages counts timeline comparison mix share "
    "kpis trends distribution breakdown ranking outcomes milestones table data dashboard"
)
_DASHBOARD_LLM_FALLBACK = (
    "Build a production-grade executive dashboard as one infographic JSON document "
    "(kind dashboard): KPIs, multiple grounded charts, evidence table, timeline, "
    "risk/opportunity highlights, and decision-ready takeaways."
    + _EXCELLENCE_USER_DIRECTIVE
)

_RISKREGISTER_RETRIEVAL_FALLBACK = (
    "risk hazard safety compliance liability penalty warranty indemnity exposure "
    "mitigation control requirement obligation deadline breach violation contingency"
)
_RISKREGISTER_LLM_FALLBACK = (
    "Build a source-grounded Risk Register with overview, risk table, mitigations, "
    "and monitoring items—every row tied to document evidence."
    + _EXCELLENCE_USER_DIRECTIVE
)

_ACTIONPLAN_RETRIEVAL_FALLBACK = (
    "action item task deliverable milestone owner responsible deadline due date "
    "next step requirement shall must submit approve complete implement schedule"
)
_ACTIONPLAN_LLM_FALLBACK = (
    "Produce a prioritised, executable Action Plan with objective, numbered actions, "
    "decisions required, and quick wins—each item traceable to the sources."
    + _EXCELLENCE_USER_DIRECTIVE
)

_TIMELINE_RETRIEVAL_FALLBACK = (
    "date deadline milestone schedule phase completion start finish duration "
    "timeline calendar week month year sequence prior before after dependency"
)
_TIMELINE_LLM_FALLBACK = (
    "Extract a defensible Project Timeline with summary, chronology table, dependencies, "
    "and documented gaps—no invented dates."
    + _EXCELLENCE_USER_DIRECTIVE
)

_FAQ_RETRIEVAL_FALLBACK = (
    "question answer requirement specification scope responsibility who what when "
    "how why policy procedure definition exception exclusion limitation"
)
_FAQ_LLM_FALLBACK = (
    "Generate a polished stakeholder FAQ with audience scope, 8–14 grounded Q&A pairs, "
    "edge cases, and an honest 'still unanswered' section."
    + _EXCELLENCE_USER_DIRECTIVE
)

_CONFLICTS_RETRIEVAL_FALLBACK = (
    "conflict contradiction inconsistent discrepancy differ versus except unless "
    "revision amendment change order alternate specification requirement mismatch gap"
)
_CONFLICTS_LLM_FALLBACK = (
    "Compare my sources and deliver a Conflict Finder report: scope, findings with both "
    "sides quoted, missing information, and RFI-style clarifications."
    + _EXCELLENCE_USER_DIRECTIVE
)

_SUMMARIZE_RETRIEVAL_FALLBACK = (
    "summary overview key points main themes conclusions takeaways executive "
    "highlights scope purpose background findings recommendations"
)
_SUMMARIZE_LLM_FALLBACK = (
    "Summarize my sources using Executive Summary, Key Points, Supporting Detail, "
    "and Next Steps—complete sections only, no empty headings."
    + _EXCELLENCE_USER_DIRECTIVE
)

_SEARCH_RETRIEVAL_FALLBACK = (
    "relevant sections passages requirements specifications details figures "
    "mentions references evidence excerpts clauses terms definitions"
)
_SEARCH_LLM_FALLBACK = (
    "Search my sources and return ranked excerpts with citations using Query Focus, "
    "Top Excerpts, and Coverage Note—prioritise verbatim evidence."
    + _EXCELLENCE_USER_DIRECTIVE
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
    (
        _DASHBOARD,
        IntentMode.DASHBOARD,
        "dashboard",
        _DASHBOARD_RETRIEVAL_FALLBACK,
        _DASHBOARD_LLM_FALLBACK,
    ),
    (
        _REPORT,
        IntentMode.DOCUMENT_REPORT,
        "report",
        "full document analysis key findings requirements risks gaps conflicts metrics milestones",
        "Analyze the complete uploaded document set and produce a structured, executive-grade "
        "professional report with fully grounded findings."
        + _EXCELLENCE_USER_DIRECTIVE,
    ),
    (
        _RISKREGISTER,
        IntentMode.RISK_REGISTER,
        "riskregister",
        _RISKREGISTER_RETRIEVAL_FALLBACK,
        _RISKREGISTER_LLM_FALLBACK,
    ),
    (
        _ACTIONPLAN,
        IntentMode.ACTION_PLAN,
        "actionplan",
        _ACTIONPLAN_RETRIEVAL_FALLBACK,
        _ACTIONPLAN_LLM_FALLBACK,
    ),
    (
        _TIMELINE,
        IntentMode.TIMELINE,
        "timeline",
        _TIMELINE_RETRIEVAL_FALLBACK,
        _TIMELINE_LLM_FALLBACK,
    ),
    (
        _FAQ,
        IntentMode.FAQ,
        "faq",
        _FAQ_RETRIEVAL_FALLBACK,
        _FAQ_LLM_FALLBACK,
    ),
    (
        _CONFLICTS,
        IntentMode.CONFLICT_FINDER,
        "conflicts",
        _CONFLICTS_RETRIEVAL_FALLBACK,
        _CONFLICTS_LLM_FALLBACK,
    ),
    (
        _SUMMARIZE,
        IntentMode.SUMMARIZER,
        "summarize",
        _SUMMARIZE_RETRIEVAL_FALLBACK,
        _SUMMARIZE_LLM_FALLBACK,
    ),
    (
        _SEARCH,
        IntentMode.SEARCH,
        "search",
        _SEARCH_RETRIEVAL_FALLBACK,
        _SEARCH_LLM_FALLBACK,
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


def is_dashboard_command(message: str) -> bool:
    return _DASHBOARD.match((message or "").strip()) is not None


def is_report_command(message: str) -> bool:
    return _REPORT.match((message or "").strip()) is not None
