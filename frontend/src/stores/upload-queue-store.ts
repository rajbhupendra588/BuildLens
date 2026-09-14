"use client";

import { create } from "zustand";
import { toast } from "sonner";
import {
  uploadAndIndexDocument,
  MAX_DOCUMENT_SIZE,
  maxDocumentSizeLabel,
} from "@/lib/document-upload";
import { notifyDocumentsChanged } from "@/lib/document-library-events";
import { UploadItem } from "@/types/document";

const UPLOAD_CONCURRENCY = 1;

let isQueueRunning = false;
const claimedIds = new Set<string>();

interface UploadQueueState {
  uploadQueue: UploadItem[];
  enqueueFiles: (files: File[], sessionId?: string | null) => void;
  patchItem: (id: string, patch: Partial<UploadItem>) => void;
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
        sessionId: sessionId ?? undefined,
      });
    }
    if (validItems.length === 0) return;

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
  try {
    await uploadAndIndexDocument(item.file, {
      sessionId: item.sessionId,
      onProgress: (percent) => {
        if (percent === 100) {
          patchItem(item.id, {
            progress: percent,
            status: "processing",
            processingStartedAt: Date.now(),
          });
        } else {
          patchItem(item.id, { progress: percent, status: "uploading" });
        }
      },
      onChatReady: () => {
        patchItem(item.id, { chatReady: true });
        toast.success(`${item.file.name} — ready to chat in this conversation`);
        window.dispatchEvent(new CustomEvent("buildlens:session-attachments-changed"));
      },
    });
    patchItem(item.id, { status: "done", progress: 100, chatReady: true });
    if (item.sessionId) {
      window.dispatchEvent(
        new CustomEvent("buildlens:session-attachments-changed"),
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    patchItem(item.id, { status: "error", error: msg });
    toast.error(`${item.file.name}: ${msg}`);
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
    patchItem(item.id, { status: "uploading", progress: 0 });
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

    const queue = get().uploadQueue;
    const doneCount = queue.filter((i) => i.status === "done").length;

    if (doneCount > 0) {
      notifyDocumentsChanged();
      const libraryOnly = queue.filter((i) => i.status === "done" && !i.sessionId);
      if (libraryOnly.length > 0) {
        toast.success(
          `${libraryOnly.length} file${libraryOnly.length > 1 ? "s" : ""} indexed in library`,
        );
      }
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
