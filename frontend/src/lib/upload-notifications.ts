"use client";

import { toast } from "sonner";

/** Files larger than this upload + index in the background with a completion notification. */
export const BACKGROUND_UPLOAD_BYTES = 10 * 1024 * 1024;

export function isLargeBackgroundUpload(file: File): boolean {
  return file.size > BACKGROUND_UPLOAD_BYTES;
}

export function formatUploadSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

let notificationPermissionRequested = false;

/** Call on user gesture (file pick / drop) before a large upload starts. */
export function prepareUploadNotifications(): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (notificationPermissionRequested) return;
  notificationPermissionRequested = true;
  if (Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

export type UploadNotifyOutcome =
  | "library-indexed"
  | "session-ready"
  | "upload-failed"
  | "index-failed";

function pushSystemNotification(title: string, body: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      tag: `buildlens-upload-${Date.now()}`,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // ignore — toast still shown
  }
}

function shouldPreferSystemNotification(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

export function notifyBackgroundUploadStarted(fileName: string, bytes: number): void {
  const size = formatUploadSize(bytes);
  toast.message(`${fileName} (${size})`, {
    description:
      "Upload received. Indexing continues in the background—we'll notify you when it's ready.",
    duration: 6000,
  });
}

export function notifyUploadOutcome(
  fileName: string,
  outcome: UploadNotifyOutcome,
  detail?: string,
): void {
  const shortName =
    fileName.length > 48 ? `${fileName.slice(0, 45)}…` : fileName;

  if (outcome === "library-indexed") {
    const title = "Document ready";
    const body = `"${shortName}" is indexed in your library.`;
    if (shouldPreferSystemNotification()) {
      pushSystemNotification(title, body);
    }
    toast.success(title, { description: body, duration: 8000 });
    return;
  }

  if (outcome === "session-ready") {
    const title = "File ready in chat";
    const body = `"${shortName}" is ready to use in this conversation.`;
    if (shouldPreferSystemNotification()) {
      pushSystemNotification(title, body);
    }
    toast.success(title, { description: body, duration: 8000 });
    return;
  }

  if (outcome === "upload-failed" || outcome === "index-failed") {
    const title =
      outcome === "upload-failed" ? "Upload failed" : "Indexing failed";
    const body = detail
      ? `"${shortName}" — ${detail}`
      : `"${shortName}" could not be processed.`;
    if (shouldPreferSystemNotification()) {
      pushSystemNotification(title, body);
    }
    toast.error(title, { description: body, duration: 10000 });
  }
}
