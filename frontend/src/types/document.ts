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
  index_status?: "indexed" | "indexing" | "error" | "partial";
  index_error?: string | null;
  /** ISO timestamp when indexing was queued or started */
  index_started_at?: string | null;
  ingest_status?: string | null;
}

export interface UploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  /** 0–100 byte-transfer completion */
  progress: number;
  bytesLoaded?: number;
  bytesTotal?: number;
  uploadStartedAt?: number;
  error?: string;
  sessionId?: string;
  chatReady?: boolean;
  /** Set when bytes are sent and the server is OCR/chunking/embedding */
  processingStartedAt?: number;
}
