const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/** URL to stream an indexed document's original file (images, PDFs, etc.). */
export function documentFileUrl(documentId: string): string {
  return `${API_BASE_URL}/documents/${documentId}/file`;
}

export function getApiOrigin(): string {
  return API_BASE_URL.replace(/\/api\/v1\/?$/, "");
}

export interface HealthResponse {
  status: string;
  app_name: string;
  app_version: string;
  environment: string;
  qdrant: { connected: boolean; status: string };
  llm: { provider: string };
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetchWithRetry(`${getApiOrigin()}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }
  return response.json();
}

const RETRYABLE_METHODS = new Set(["GET", "HEAD", undefined]);

const DEFAULT_GET_RETRIES = 6;
const FETCH_ATTEMPT_TIMEOUT_MS = 20_000;

export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    error.name === "TypeError" ||
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    msg.includes("could not reach the buildlens api") ||
    msg.includes("timed out")
  );
}

/** Log without passing Error objects — Next.js overlays TypeError from console.error. */
export function logApiError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.warn(`${context}: ${message}`);
}

function normalizeFetchError(error: unknown): Error {
  if (
    (error instanceof DOMException || error instanceof Error) &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new Error(
      "The BuildLens API timed out. Check that the backend is running on port 8000.",
    );
  }
  if (isTransientNetworkError(error)) {
    return new Error(
      "Could not reach the BuildLens API. Start the backend (port 8000) and refresh.",
    );
  }
  return error instanceof Error
    ? error
    : new Error("Failed to reach the BuildLens API");
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = DEFAULT_GET_RETRIES,
): Promise<Response> {
  const method = options?.method?.toUpperCase();
  const shouldRetry = RETRYABLE_METHODS.has(method);
  const attempts = shouldRetry ? retries : 0;
  let lastError: unknown;

  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(FETCH_ATTEMPT_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delayMs = Math.min(8000, 600 * 2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw normalizeFetchError(lastError);
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit & { retries?: number },
): Promise<T> {
  const { retries, ...fetchOptions } = options ?? {};
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };
  if (fetchOptions.body != null && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetchWithRetry(
    `${API_BASE_URL}${path}`,
    {
      ...fetchOptions,
      headers,
    },
    retries,
  );

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

export async function apiStream(
  path: string,
  options?: RequestInit & { signal?: AbortSignal },
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
  });

  if (!response.ok || !response.body) {
    throw new Error("Failed to start stream");
  }

  return response.body.getReader();
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || `Upload failed: ${response.statusText}`,
    );
  }

  return response.json();
}

export interface IngestJobResponse {
  job_id: string;
  status:
    | "queued"
    | "processing"
    | "quick_ready"
    | "success"
    | "partial"
    | "error";
  file_name?: string;
  message?: string;
  document_id?: string;
  total_chunks?: number;
  detail?: string;
  chat_ready?: boolean;
  quick_chars?: number;
  index_error?: string;
}

const INGEST_POLL_MS = 2000;
const INGEST_POLL_MAX_MS = 30 * 60 * 1000;

export async function pollIngestJobUntilChatReady(
  jobId: string,
  onTick?: (job: IngestJobResponse) => void,
): Promise<IngestJobResponse> {
  const started = Date.now();
  while (Date.now() - started < INGEST_POLL_MAX_MS) {
    try {
      const job = await apiRequest<IngestJobResponse>(`/ingest/jobs/${jobId}`, {
        retries: 4,
      });
      onTick?.(job);
      if (
        job.status === "quick_ready" ||
        job.chat_ready === true ||
        job.status === "success" ||
        job.status === "partial"
      ) {
        return job;
      }
      if (job.status === "error") {
        throw new Error(
          typeof job.detail === "string"
            ? job.detail
            : "Document processing failed on the server.",
        );
      }
    } catch (error) {
      if (isTransientNetworkError(error)) {
        await new Promise((resolve) => setTimeout(resolve, INGEST_POLL_MS));
        continue;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Quick preview timed out. Try asking a question anyway.");
}

export async function pollIngestJob(
  jobId: string,
  onTick?: (job: IngestJobResponse) => void,
): Promise<IngestJobResponse> {
  const started = Date.now();
  while (Date.now() - started < INGEST_POLL_MAX_MS) {
    try {
      const job = await apiRequest<IngestJobResponse>(`/ingest/jobs/${jobId}`, {
        retries: 4,
      });
      onTick?.(job);
      if (job.status === "success" || job.status === "partial") return job;
      if (job.status === "error") {
        throw new Error(
          typeof job.detail === "string"
            ? job.detail
            : "Document indexing failed on the server.",
        );
      }
    } catch (error) {
      if (isTransientNetworkError(error)) {
        await new Promise((resolve) => setTimeout(resolve, INGEST_POLL_MS * 2));
        continue;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, INGEST_POLL_MS));
  }
  throw new Error(
    "Indexing timed out on the server. Check Library—the file may still appear when processing finishes.",
  );
}

export function apiUploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}${path}`);
    // Up to 1 GB uploads on slower links; indexing is async after this returns.
    xhr.timeout = 30 * 60 * 1000;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          const detail = err.detail ?? err.error;
          reject(new Error(detail || `Upload failed: ${xhr.statusText}`));
        } catch {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      }
    });

    xhr.addEventListener("error", () =>
      reject(
        new Error(
          "Could not reach the API. Check that the backend is running.",
        ),
      ),
    );
    xhr.addEventListener("timeout", () =>
      reject(new Error("Upload timed out while processing the file.")),
    );
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
    xhr.send(formData);
  });
}
