export interface LibraryDocument {
  document_id: string;
  file_name: string;
  file_size?: number | null;
  has_file?: boolean;
  media_type?: string | null;
  chunk_count?: number;
}

export interface UploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  progress: number;
  error?: string;
  sessionId?: string;
  chatReady?: boolean;
  /** Set when bytes are sent and the server is OCR/chunking/embedding */
  processingStartedAt?: number;
}
