"use client";

import { create } from "zustand";
import { toast } from "sonner";
import {
  uploadAndIndexDocument,
  watchIngestJob,
  MAX_DOCUMENT_SIZE,
  maxDocumentSizeLabel,
  isLargeBackgroundUpload,
} from "@/lib/document-upload";
import {
  notifyBackgroundUploadStarted,
  notifyUploadOutcome,
  prepareUploadNotifications,
} from "@/lib/upload-notifications";
import { notifyDocumentsChanged } from "@/lib/document-library-events";
import { UploadItem } from "@/types/document";

/** Parallel HTTP uploads (indexing still serialized on server for Docling safety). */
const UPLOAD_CONCURRENCY = 3;

let isQueueRunning = false;
const claimedIds = new Set<string>();

interface UploadQueueState {
  uploadQueue: UploadItem[];
  enqueueFiles: (files: File[], sessionId?: string | null) => void;
  patchItem: (id: string, patch: Partial<UploadItem>) => void;
  removeItem: (id: string) => void;
  clearFinished: () => void;
}

export const useUploadQueueStore = create<UploadQueueState>((set, get) => ({
  uploadQueue: [],

  patchItem: (id, patch) => {
    set((state) => ({
      uploadQueue: state.uploadQueue.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  },

  removeItem: (id) => {
    set((state) => ({
      uploadQueue: state.uploadQueue.filter((item) => item.id !== id),
    }));
  },

  clearFinished: () => {
    set((state) => ({
      uploadQueue: state.uploadQueue.filter(
        (i) =>
          i.status === "pending" ||
          i.status === "uploading" ||
          i.status === "processing",
      ),
    }));
  },

  enqueueFiles: (files, sessionId) => {
    const validItems: UploadItem[] = [];
    for (const file of files) {
      if (file.size > MAX_DOCUMENT_SIZE) {
        toast.error(
          `${file.name} is too large — max ${maxDocumentSizeLabel()} (got ${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
        );
        continue;
      }
      validItems.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        status: "pending",
        progress: 0,
        bytesLoaded: 0,
        bytesTotal: file.size,
        sessionId: sessionId ?? undefined,
      });
    }
    if (validItems.length === 0) return;

    if (validItems.some((i) => isLargeBackgroundUpload(i.file))) {
      prepareUploadNotifications();
    }

    set((state) => ({
      uploadQueue: [...state.uploadQueue, ...validItems],
    }));

    void runUploadQueue(get);
  },
}));

async function uploadOne(
  item: UploadItem,
  patchItem: UploadQueueState["patchItem"],
) {
  const large = isLargeBackgroundUpload(item.file);

  try {
    const { jobId } = await uploadAndIndexDocument(item.file, {
      sessionId: item.sessionId,
      runInBackground: large,
      disableBackgroundWatch: true,
      notifyOnIndex: false,
      onProgress: (percent, bytes) => {
        const now = Date.now();
        const current = useUploadQueueStore
          .getState()
          .uploadQueue.find((i) => i.id === item.id);
        const loaded = bytes?.loaded ?? current?.bytesLoaded ?? 0;
        const total = bytes?.total || current?.bytesTotal || item.file.size;
        const uploadStartedAt = current?.uploadStartedAt ?? now;
        if (percent >= 100) {
          patchItem(item.id, {
            progress: 100,
            bytesLoaded: total,
            bytesTotal: total,
            uploadStartedAt,
            status: "processing",
            processingStartedAt: now,
          });
          return;
        }
        patchItem(item.id, {
          progress: percent,
          bytesLoaded: loaded,
          bytesTotal: total,
          uploadStartedAt,
          status: "uploading",
        });
      },
      onChatReady: () => {
        patchItem(item.id, {
          chatReady: true,
          ...(large ? { status: "done" as const, progress: 100 } : {}),
        });
        if (!large) {
          toast.success(`${item.file.name} — ready to chat in this conversation`);
        }
        window.dispatchEvent(
          new CustomEvent("buildlens:session-attachments-changed"),
        );
      },
    });

    if (large) {
      notifyBackgroundUploadStarted(item.file.name, item.file.size);
    }

    if (item.sessionId) {
      if (large) {
        patchItem(item.id, {
          status: "processing",
          progress: 100,
          processingStartedAt: Date.now(),
        });
        return;
      }
      patchItem(item.id, { status: "done", progress: 100, chatReady: true });
      window.dispatchEvent(
        new CustomEvent("buildlens:session-attachments-changed"),
      );
      return;
    }

    patchItem(item.id, {
      status: "processing",
      progress: 100,
      processingStartedAt: Date.now(),
    });

    watchIngestJob(jobId, {
      notifyOnResult: large,
      fileName: item.file.name,
      onComplete: () => {
        patchItem(item.id, { status: "done", progress: 100, chatReady: true });
        if (!large) {
          toast.success(`${item.file.name} indexed in library`);
        }
        notifyDocumentsChanged();
      },
      onError: (message) => {
        patchItem(item.id, { status: "error", error: message });
        toast.error(`${item.file.name}: ${message}`);
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    patchItem(item.id, { status: "error", error: msg });
    if (large) {
      notifyUploadOutcome(item.file.name, "upload-failed", msg);
    } else {
      toast.error(`${item.file.name}: ${msg}`);
    }
  }
}

async function runWorker(get: () => UploadQueueState) {
  const { patchItem } = get();
  while (true) {
    const item = get().uploadQueue.find(
      (i) => i.status === "pending" && !claimedIds.has(i.id),
    );
    if (!item) break;
    claimedIds.add(item.id);
    patchItem(item.id, {
      status: "uploading",
      progress: 0,
      bytesLoaded: 0,
      bytesTotal: item.file.size,
      uploadStartedAt: Date.now(),
    });
    await uploadOne(item, patchItem);
    const next = get().uploadQueue;
    const pending = next.find(
      (i) => i.status === "pending" && !claimedIds.has(i.id),
    );
    if (!pending) break;
  }
}

async function runUploadQueue(get: () => UploadQueueState) {
  if (isQueueRunning) return;
  isQueueRunning = true;

  try {
    while (
      get().uploadQueue.some(
        (i) => i.status === "pending" && !claimedIds.has(i.id),
      )
    ) {
      await Promise.all(
        Array.from({ length: UPLOAD_CONCURRENCY }, () => runWorker(get)),
      );
    }

    await new Promise((r) => setTimeout(r, 2000));
    claimedIds.clear();
    get().clearFinished();
  } finally {
    isQueueRunning = false;
    if (
      get().uploadQueue.some(
        (i) => i.status === "pending" && !claimedIds.has(i.id),
      )
    ) {
      void runUploadQueue(get);
    }
  }
}

export function enqueueDocumentFiles(
  files: File[],
  sessionId?: string | null,
) {
  useUploadQueueStore.getState().enqueueFiles(files, sessionId);
}
