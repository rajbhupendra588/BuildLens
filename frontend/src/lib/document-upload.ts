import {
  apiRequest,
  apiUploadWithProgress,
  pollIngestJob,
  pollIngestJobUntilChatReady,
} from "@/lib/api";
import { notifyDocumentsChanged } from "@/lib/document-library-events";

/** 20 MiB — must match backend STORAGE__MAX_UPLOAD_BYTES */
export const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;

/** Must match backend STORAGE__MAX_LIBRARY_FILES */
export const MAX_LIBRARY_FILES = 5;

/** Must match backend STORAGE__MAX_SESSION_ATTACHMENTS */
export const MAX_SESSION_ATTACHMENTS = 5;

export function maxDocumentSizeLabel(): string {
  return `${MAX_DOCUMENT_SIZE / (1024 * 1024)} MB`;
}

export function librarySlotsRemaining(currentLibraryCount: number): number {
  return Math.max(0, MAX_LIBRARY_FILES - currentLibraryCount);
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
  /** Library only: block until Qdrant indexing finishes (default: return after bytes are saved). */
  waitForFullIndex?: boolean;
  onIndexComplete?: () => void;
  onIndexError?: (message: string) => void;
}

export interface UploadIndexResult {
  jobId: string;
  documentId: string;
}

/**
 * Upload file bytes, then optionally wait for chat-ready (session) or full index (library).
 * Library uploads return as soon as the server has the file; indexing continues in background.
 */
export async function uploadAndIndexDocument(
  file: File,
  options?: UploadIndexOptions,
): Promise<UploadIndexResult> {
  const err = validateDocumentFile(file);
  if (err) throw new Error(err);

  const formData = new FormData();
  formData.append("file", file);
  if (options?.sessionId) {
    formData.append("session_id", options.sessionId);
  }

  const accepted = await apiUploadWithProgress<{
    job_id: string;
    document_id: string;
  }>("/ingest/upload", formData, (pct) =>
    options?.onProgress?.(Math.min(pct, 100)),
  );
  options?.onProgress?.(100);

  const result = {
    jobId: accepted.job_id,
    documentId: accepted.document_id,
  };

  if (options?.sessionId) {
    await pollIngestJobUntilChatReady(accepted.job_id, (job) => {
      if (job.status === "quick_ready" || job.chat_ready) {
        options?.onChatReady?.();
      }
    });

    if (accepted.document_id) {
      try {
        await apiRequest(
          `/chat/sessions/${options.sessionId}/attachments`,
          {
            method: "POST",
            body: JSON.stringify({ document_id: accepted.document_id }),
          },
        );
      } catch {
        // Row may already exist from ingest quick_extract attach_to_session
      }
      window.dispatchEvent(
        new CustomEvent("buildlens:session-attachments-changed"),
      );
    }

    void pollIngestJob(accepted.job_id)
      .then(() => notifyDocumentsChanged())
      .catch(() => notifyDocumentsChanged());
    return result;
  }

  const runBackgroundIndex = () => {
    void pollIngestJob(accepted.job_id)
      .then(() => {
        notifyDocumentsChanged();
        options?.onIndexComplete?.();
      })
      .catch((error: unknown) => {
        notifyDocumentsChanged();
        const message =
          error instanceof Error ? error.message : "Indexing failed";
        options?.onIndexError?.(message);
      });
  };

  if (options?.waitForFullIndex) {
    await pollIngestJob(accepted.job_id);
    notifyDocumentsChanged();
    options?.onIndexComplete?.();
  } else {
    notifyDocumentsChanged();
    runBackgroundIndex();
  }

  return result;
}

/** Poll until library indexing completes (for queue UI). */
export function watchIngestJob(
  jobId: string,
  handlers: {
    onComplete?: () => void;
    onError?: (message: string) => void;
  },
): void {
  void pollIngestJob(jobId)
    .then(() => {
      notifyDocumentsChanged();
      handlers.onComplete?.();
    })
    .catch((error: unknown) => {
      notifyDocumentsChanged();
      handlers.onError?.(
        error instanceof Error ? error.message : "Indexing failed",
      );
    });
}
