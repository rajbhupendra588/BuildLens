export type ReportStatus =
  | "QUEUED"
  | "ANALYZING"
  | "GENERATING"
  | "COMPLETED"
  | "FAILED";

export type EvidenceLabel =
  | "DIRECTLY_STATED"
  | "DERIVED_FROM_DOCUMENT"
  | "MULTIPLE_SOURCES"
  | "POTENTIAL_GAP"
  | "CONFLICTING_INFORMATION"
  | "NOT_SPECIFIED";

export interface ReportSource {
  index: number;
  document_id?: string | null;
  file_name: string;
  page_number?: number | null;
  section_title?: string | null;
  snippet?: string;
  location_label?: string | null;
  chunk_id?: string | null;
  element_type?: string | null;
}

export interface CitedText {
  text: string;
  source_index?: number | null;
  evidence?: EvidenceLabel;
}

export interface ProfileField {
  label: string;
  value: string;
  source_index?: number | null;
  evidence?: EvidenceLabel;
}

export interface FactRow {
  attribute: string;
  value: string;
  source_index?: number | null;
  evidence?: EvidenceLabel;
}

export interface MetricRow {
  metric: string;
  value: string;
  context?: string;
  source_index?: number | null;
  evidence?: EvidenceLabel;
  calculated?: boolean;
}

export interface MilestoneRow {
  milestone: string;
  date: string;
  source_index?: number | null;
}

export interface RequirementGroup {
  category: string;
  items: CitedText[];
}

export interface EntityGroup {
  category: string;
  items: CitedText[];
}

export interface RiskItem {
  risk: string;
  impact?: string;
  mitigation?: string;
  mitigation_is_recommendation?: boolean;
  category?: string;
  source_index?: number | null;
}

export interface GapItem {
  gap: string;
  impact?: string;
  source_index?: number | null;
}

export interface ConflictItem {
  topic: string;
  statements: CitedText[];
  status?: string;
}

export interface ActionRow {
  action: string;
  owner?: string;
  due?: string;
  source_index?: number | null;
}

export interface DecisionItem {
  decision: string;
  rationale?: string;
  source_index?: number | null;
}

export interface TableSummary {
  title: string;
  summary?: string;
  rows?: string[][];
  source_index?: number | null;
}

export interface FigureRef {
  title: string;
  purpose?: string;
  sheet?: string | null;
  source_index?: number | null;
  description?: string;
}

export interface DocumentProfile {
  name?: ProfileField;
  document_type?: ProfileField;
  revision?: ProfileField;
  author?: ProfileField;
  organization?: ProfileField;
  creation_date?: ProfileField;
  approval_date?: ProfileField;
  effective_date?: ProfileField;
  page_count?: ProfileField;
  language?: ProfileField;
  status?: ProfileField;
}

export interface ReportContent {
  title?: string;
  document_names?: string[];
  document_count?: number;
  limitations?: string | null;
  executive_summary?: string;
  purpose?: string;
  top_findings?: CitedText[];
  document_profile?: DocumentProfile;
  key_facts?: FactRow[];
  requirements?: RequirementGroup[];
  metrics?: MetricRow[];
  milestones?: MilestoneRow[];
  entities?: EntityGroup[];
  tables?: TableSummary[];
  figures?: FigureRef[];
  risks?: RiskItem[];
  gaps?: GapItem[];
  conflicts?: ConflictItem[];
  actions?: ActionRow[];
  decisions?: DecisionItem[];
  document_actions?: CitedText[];
  observations?: string[];
  cross_document_findings?: ConflictItem[];
  sources?: ReportSource[];
}

export interface ReportPayload {
  reportId: string;
  status: ReportStatus;
  reportType?: string;
  title: string;
  documentCount: number;
  documentNames: string[];
  pageCount?: number | null;
  generatedAt?: string | null;
  pdfUrl?: string | null;
  downloadName?: string | null;
  limitations?: string | null;
  errorMessage?: string | null;
  content?: ReportContent | null;
  sections?: ReportContent | null;
}

export interface ReportMedia {
  media_type: "document_report";
  report_id: string;
  title?: string;
  page_count?: number | null;
  document_names?: string[];
  download_name?: string | null;
  limitations?: string | null;
}

export function isReportMedia(item: unknown): item is ReportMedia {
  return (
    typeof item === "object" &&
    item !== null &&
    (item as { media_type?: string }).media_type === "document_report" &&
    typeof (item as { report_id?: string }).report_id === "string"
  );
}
