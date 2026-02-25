export interface SourceItem {
  file_name: string;
  score: number;
  snippet: string;
  page_number?: number | null;
  section_title?: string | null;
  language?: string | null;
  element_type?: string | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: SourceItem[];
  provider?: string;
  model?: string;
  created_at: string;
}

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
