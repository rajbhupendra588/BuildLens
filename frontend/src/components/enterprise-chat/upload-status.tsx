"use client";

import { Loader2, CheckCircle2 } from "lucide-react";
import { useUploadQueueStore } from "@/stores/upload-queue-store";
import { useActiveChatSessionId } from "@/lib/active-chat-session";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  pending: "Uploading",
  uploading: "Uploading",
  processing: "Processing",
  extracting: "Extracting",
  indexing: "Indexing",
};

interface UploadStatusProps {
  className?: string;
}

export function UploadStatus({ className }: UploadStatusProps) {
  const sessionId = useActiveChatSessionId();
  const queue = useUploadQueueStore((s) => s.uploadQueue);

  const active = queue.find(
    (item) =>
      (!sessionId || item.sessionId === sessionId) &&
      item.status !== "done" &&
      item.status !== "error",
  );

  const ready = queue.find(
    (item) =>
      (!sessionId || item.sessionId === sessionId) &&
      item.chatReady &&
      (item.status === "processing" || item.status === "done"),
  );

  if (!active && !ready) return null;

  if (ready) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400",
          className,
        )}
        role="status"
      >
        <CheckCircle2 className="size-3.5 shrink-0" />
        <span>
          <span className="font-medium">{ready.file.name}</span> is ready. Ask a
          question about it.
        </span>
      </p>
    );
  }

  if (!active) return null;

  const label =
    STATUS_LABEL[active.status] ??
    (active.chatReady ? "Ready" : "Processing");

  return (
    <p
      className={cn(
        "flex items-center gap-2 text-[12px] text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin" />
      <span>
        {label}: <span className="text-foreground/90">{active.file.name}</span>
      </span>
    </p>
  );
}
