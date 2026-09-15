export interface LibraryDocument {
  document_id: string;
  file_name: string;
  collection?: string;
  file_size?: number | null;
  has_file?: boolean;
  media_type?: string | null;
  chunk_count?: number;
  /** ISO timestamp from stored file mtime when the original is on disk */
  uploaded_at?: string | null;
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
