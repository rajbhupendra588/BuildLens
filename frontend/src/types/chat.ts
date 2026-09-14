export interface SourceItem {
  document_id?: string | null;
  file_name: string;
  score: number;
  snippet: string;
  page_number?: number | null;
  section_title?: string | null;
  language?: string | null;
  element_type?: string | null;
  is_image?: boolean;
}

export interface MediaAttachment {
  document_id: string;
  file_name: string;
  media_type: string;
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
  DATA_ANALYST: "Data Analyst",
  CREATIVE: "Creative Synthesizer",
};

export const MODE_ICONS: Record<string, string> = {
  GENERAL: "✨",
  DOCUMENT_ANALYST: "📄",
  CODE_ARCHITECT: "💻",
  CODE_DEBUGGER: "🐛",
  SUMMARIZER: "📋",
  DATA_ANALYST: "📊",
  CREATIVE: "💡",
};

export interface ChatSession {
  id: string;
  title: string;
  provider: string;
  model_name: string;
  created_at: string;
}

export interface ModelItem {
  name: string;
  provider: string;
}

export interface ModelsResponse {
  local: ModelItem[];
  cloud: ModelItem[];
}
