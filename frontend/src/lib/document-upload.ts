import {
  apiUploadWithProgress,
  pollIngestJob,
  pollIngestJobUntilChatReady,
} from "@/lib/api";
import { notifyDocumentsChanged } from "@/lib/document-library-events";

/** 1 GiB — must match backend STORAGE__MAX_UPLOAD_BYTES */
export const MAX_DOCUMENT_SIZE = 1024 * 1024 * 1024;

export function maxDocumentSizeLabel(): string {
  const gb = MAX_DOCUMENT_SIZE / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb} GB` : `${MAX_DOCUMENT_SIZE / (1024 * 1024)} MB`;
}

export const DOCUMENT_ACCEPT = [
  ".pdf",
  ".docx",
  ".pptx",
  ".txt",
  ".md",
  ".puml",
  ".csv",
  ".xlsx",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".env",
  ".png",
  ".jpg",
  ".jpeg",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".py",
  ".pyw",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".java",
  ".kt",
  ".kts",
  ".go",
  ".rs",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".cxx",
  ".hpp",
  ".hxx",
  ".rb",
  ".php",
  ".swift",
  ".dart",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".r",
  ".scala",
  ".lua",
  ".tf",
].join(",");

export function validateDocumentFile(file: File): string | null {
  if (file.size > MAX_DOCUMENT_SIZE) {
    return `${file.name} exceeds ${maxDocumentSizeLabel()} (${(file.size / (1024 * 1024)).toFixed(1)} MB).`;
  }
  return null;
}

export interface UploadIndexOptions {
  sessionId?: string | null;
  onProgress?: (percent: number) => void;
  onChatReady?: () => void;
}

/**
 * Upload file bytes, then wait for chat-ready (session) or full index (library).
 * Session uploads: returns after quick extract; full index continues on server.
 */
export async function uploadAndIndexDocument(
  file: File,
  options?: UploadIndexOptions,
): Promise<void> {
  const err = validateDocumentFile(file);
  if (err) throw new Error(err);

  const formData = new FormData();
  formData.append("file", file);
  if (options?.sessionId) {
    formData.append("session_id", options.sessionId);
  }

  const accepted = await apiUploadWithProgress<{ job_id: string }>(
    "/ingest/upload",
    formData,
    (pct) => options?.onProgress?.(Math.min(pct, 100)),
  );
  options?.onProgress?.(100);

  if (options?.sessionId) {
    await pollIngestJobUntilChatReady(accepted.job_id, (job) => {
      if (job.status === "quick_ready" || job.chat_ready) {
        options?.onChatReady?.();
      }
    });
    void pollIngestJob(accepted.job_id)
      .then(() => notifyDocumentsChanged())
      .catch(() => notifyDocumentsChanged());
    return;
  }

  await pollIngestJob(accepted.job_id);
  notifyDocumentsChanged();
}
