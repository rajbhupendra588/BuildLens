export interface SourceBBox {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface SourceItem {
  document_id?: string | null;
  chunk_id?: string | null;
  file_name: string;
  score: number;
  snippet: string;
  page_number?: number | null;
  section_title?: string | null;
  paragraph_index?: number | null;
  line_start?: number | null;
  line_end?: number | null;
  location_label?: string | null;
  source_index?: number | null;
  language?: string | null;
  element_type?: string | null;
  is_image?: boolean;
  bbox?: SourceBBox | null;
  collection?: string | null;
}

export interface MediaAttachment {
  document_id?: string;
  file_name?: string;
  media_type: string;
  report_id?: string;
  title?: string;
  page_count?: number | null;
  document_names?: string[];
  download_name?: string | null;
  limitations?: string | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: SourceItem[];
  media?: MediaAttachment[];
  provider?: string;
  model?: string;
  detectedMode?: string;
  modeLabel?: string;
  modeIcon?: string;
  created_at: string;
}

export const MODE_LABELS: Record<string, string> = {
  GENERAL: "General Assistant",
  DOCUMENT_ANALYST: "Document Analyst",
  CODE_ARCHITECT: "Code Architect",
  CODE_DEBUGGER: "Code Debugger",
  SUMMARIZER: "Summarizer",
  BRIEFING_DOC: "Briefing Document",
  STUDY_GUIDE: "Study Guide",
  INFOGRAPHIC: "Infographic",
  DASHBOARD: "Visual Dashboard",
  DOCUMENT_REPORT: "Document Report",
  DATA_ANALYST: "Data Analyst",
  CREATIVE: "Creative Synthesizer",
};

export const MODE_ICONS: Record<string, string> = {
  GENERAL: "✨",
  DOCUMENT_ANALYST: "📄",
  CODE_ARCHITECT: "💻",
  CODE_DEBUGGER: "🐛",
  SUMMARIZER: "📋",
  BRIEFING_DOC: "📑",
  STUDY_GUIDE: "📚",
  INFOGRAPHIC: "🎨",
  DASHBOARD: "📊",
  DOCUMENT_REPORT: "📄",
  DATA_ANALYST: "📈",
  CREATIVE: "💡",
};

export type HistoryMessage = Message & {
  detected_mode?: string | null;
};

export function hydrateChatMessage(m: HistoryMessage): Message {
  const detectedMode = m.detectedMode ?? m.detected_mode ?? undefined;
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    sources: m.sources,
    media: m.media ?? [],
    provider: m.provider,
    model: m.model,
    detectedMode,
    modeLabel: detectedMode ? MODE_LABELS[detectedMode] : undefined,
    modeIcon: detectedMode ? MODE_ICONS[detectedMode] : undefined,
    created_at: m.created_at,
  };
}

export interface ChatSession {
  id: string;
  title: string;
  provider: string;
  model_name: string;
  created_at: string;
  updated_at?: string;
  is_pinned?: boolean;
}

export interface ModelItem {
  name: string;
  provider: string;
}

export interface ModelsResponse {
  local: ModelItem[];
  cloud: ModelItem[];
}
