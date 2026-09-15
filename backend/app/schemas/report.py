from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ReportType(str, Enum):
    FULL_DOCUMENT_REPORT = "FULL_DOCUMENT_REPORT"
    # Future: SUMMARY, TECHNICAL, RISKS, COMPLIANCE, SCHEDULE, BOQ


class ReportStatus(str, Enum):
    QUEUED = "QUEUED"
    ANALYZING = "ANALYZING"
    GENERATING = "GENERATING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class EvidenceLabel(str, Enum):
    DIRECTLY_STATED = "DIRECTLY_STATED"
    DERIVED_FROM_DOCUMENT = "DERIVED_FROM_DOCUMENT"
    MULTIPLE_SOURCES = "MULTIPLE_SOURCES"
    POTENTIAL_GAP = "POTENTIAL_GAP"
    CONFLICTING_INFORMATION = "CONFLICTING_INFORMATION"
    NOT_SPECIFIED = "NOT_SPECIFIED"


class Priority(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


NOT_SPECIFIED = "Not specified in the document."


class SourceRef(BaseModel):
    index: int
    document_id: Optional[str] = None
    file_name: str
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    snippet: str = ""
    location_label: Optional[str] = None
    chunk_id: Optional[str] = None
    element_type: Optional[str] = None


class CitedText(BaseModel):
    text: str
    source_index: Optional[int] = None
    evidence: EvidenceLabel = EvidenceLabel.DIRECTLY_STATED
    priority: Priority = Priority.HIGH


class ProfileField(BaseModel):
    label: str
    value: str = NOT_SPECIFIED
    source_index: Optional[int] = None
    evidence: EvidenceLabel = EvidenceLabel.NOT_SPECIFIED


class FactRow(BaseModel):
    attribute: str
    value: str
    source_index: Optional[int] = None
    evidence: EvidenceLabel = EvidenceLabel.DIRECTLY_STATED
    priority: Priority = Priority.HIGH


class MetricRow(BaseModel):
    metric: str
    value: str
    context: str = ""
    source_index: Optional[int] = None
    evidence: EvidenceLabel = EvidenceLabel.DIRECTLY_STATED
    calculated: bool = False
    priority: Priority = Priority.HIGH


class RequirementGroup(BaseModel):
    category: str
    items: list[CitedText] = Field(default_factory=list)


class MilestoneRow(BaseModel):
    milestone: str
    date: str
    source_index: Optional[int] = None
    evidence: EvidenceLabel = EvidenceLabel.DIRECTLY_STATED
    priority: Priority = Priority.HIGH


class EntityGroup(BaseModel):
    category: str
    items: list[CitedText] = Field(default_factory=list)


class TableSummary(BaseModel):
    title: str
    summary: str
    rows: list[list[str]] = Field(default_factory=list)
    source_index: Optional[int] = None
    priority: Priority = Priority.MEDIUM


class FigureRef(BaseModel):
    title: str
    purpose: str = NOT_SPECIFIED
    sheet: Optional[str] = None
    source_index: Optional[int] = None
    description: str = ""
    priority: Priority = Priority.MEDIUM


class RiskItem(BaseModel):
    risk: str
    impact: str = NOT_SPECIFIED
    mitigation: str = NOT_SPECIFIED
    mitigation_is_recommendation: bool = False
    category: str = ""
    source_index: Optional[int] = None
    evidence: EvidenceLabel = EvidenceLabel.DIRECTLY_STATED
    priority: Priority = Priority.CRITICAL


class GapItem(BaseModel):
    gap: str
    impact: str = ""
    source_index: Optional[int] = None
    evidence: EvidenceLabel = EvidenceLabel.POTENTIAL_GAP
    priority: Priority = Priority.HIGH


class ConflictItem(BaseModel):
    topic: str
    statements: list[CitedText] = Field(default_factory=list)
    status: str = "Requires clarification."
    evidence: EvidenceLabel = EvidenceLabel.CONFLICTING_INFORMATION
    priority: Priority = Priority.CRITICAL


class ActionRow(BaseModel):
    action: str
    owner: str = "Not specified"
    due: str = "Not specified"
    source_index: Optional[int] = None
    evidence: EvidenceLabel = EvidenceLabel.DIRECTLY_STATED
    priority: Priority = Priority.HIGH


class DecisionItem(BaseModel):
    decision: str
    rationale: str = NOT_SPECIFIED
    source_index: Optional[int] = None
    evidence: EvidenceLabel = EvidenceLabel.DIRECTLY_STATED
    priority: Priority = Priority.HIGH


class DocumentProfile(BaseModel):
    name: ProfileField = Field(default_factory=lambda: ProfileField(label="Document name"))
    document_type: ProfileField = Field(
        default_factory=lambda: ProfileField(label="Document type")
    )
    revision: ProfileField = Field(default_factory=lambda: ProfileField(label="Revision"))
    author: ProfileField = Field(default_factory=lambda: ProfileField(label="Author"))
    organization: ProfileField = Field(
        default_factory=lambda: ProfileField(label="Organization")
    )
    creation_date: ProfileField = Field(
        default_factory=lambda: ProfileField(label="Creation date")
    )
    approval_date: ProfileField = Field(
        default_factory=lambda: ProfileField(label="Approval date")
    )
    effective_date: ProfileField = Field(
        default_factory=lambda: ProfileField(label="Effective date")
    )
    page_count: ProfileField = Field(default_factory=lambda: ProfileField(label="Page count"))
    language: ProfileField = Field(default_factory=lambda: ProfileField(label="Language"))
    status: ProfileField = Field(default_factory=lambda: ProfileField(label="Document status"))


class ReportContent(BaseModel):
    title: str = "BuildLens Document Report"
    report_type: str = ReportType.FULL_DOCUMENT_REPORT.value
    document_names: list[str] = Field(default_factory=list)
    document_count: int = 0
    limitations: Optional[str] = None
    executive_summary: str = ""
    purpose: str = ""
    top_findings: list[CitedText] = Field(default_factory=list)
    document_profile: DocumentProfile = Field(default_factory=DocumentProfile)
    key_facts: list[FactRow] = Field(default_factory=list)
    requirements: list[RequirementGroup] = Field(default_factory=list)
    metrics: list[MetricRow] = Field(default_factory=list)
    milestones: list[MilestoneRow] = Field(default_factory=list)
    entities: list[EntityGroup] = Field(default_factory=list)
    tables: list[TableSummary] = Field(default_factory=list)
    figures: list[FigureRef] = Field(default_factory=list)
    risks: list[RiskItem] = Field(default_factory=list)
    gaps: list[GapItem] = Field(default_factory=list)
    conflicts: list[ConflictItem] = Field(default_factory=list)
    actions: list[ActionRow] = Field(default_factory=list)
    decisions: list[DecisionItem] = Field(default_factory=list)
    document_actions: list[CitedText] = Field(default_factory=list)
    observations: list[str] = Field(default_factory=list)
    cross_document_findings: list[ConflictItem] = Field(default_factory=list)
    sources: list[SourceRef] = Field(default_factory=list)


class CreateReportRequest(BaseModel):
    documentIds: list[str] = Field(default_factory=list)
    type: ReportType = ReportType.FULL_DOCUMENT_REPORT
    sessionId: Optional[str] = None
    projectId: Optional[str] = None


class ReportResponse(BaseModel):
    reportId: str
    status: str
    reportType: str = ReportType.FULL_DOCUMENT_REPORT.value
    title: str = "Document Report"
    documentCount: int = 0
    documentNames: list[str] = Field(default_factory=list)
    pageCount: Optional[int] = None
    generatedAt: Optional[datetime] = None
    pdfUrl: Optional[str] = None
    downloadName: Optional[str] = None
    limitations: Optional[str] = None
    errorMessage: Optional[str] = None
    sections: Optional[dict[str, Any]] = None
    content: Optional[dict[str, Any]] = None
    progress: Optional[str] = None
