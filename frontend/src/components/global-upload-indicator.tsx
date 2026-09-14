"use client";

import { Loader2 } from "lucide-react";
import { useUploadQueueStore } from "@/stores/upload-queue-store";
import { cn } from "@/lib/utils";

/** Fixed banner — uploads keep running when navigating between pages. */
export function GlobalUploadIndicator() {
  const queue = useUploadQueueStore((s) => s.uploadQueue);
  const active = queue.filter(
    (i) =>
      i.status === "pending" ||
      i.status === "uploading" ||
      i.status === "processing",
  );

  if (active.length === 0) return null;

  const current = active[0];
  const label = current.chatReady
    ? `Library indexing ${current.file.name}…`
    : current.status === "processing"
      ? current.sessionId
        ? `Preparing ${current.file.name} for chat…`
        : `Indexing ${current.file.name}…`
      : current.status === "uploading"
        ? `Uploading ${current.file.name} (${current.progress}%)`
        : `Queued: ${current.file.name}`;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 z-50 -translate-x-1/2",
        "flex max-w-md items-center gap-2 rounded-full border bg-card px-4 py-2 shadow-lg",
        "text-xs text-foreground",
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
      <span className="truncate">{label}</span>
      {active.length > 1 ? (
        <span className="shrink-0 text-muted-foreground">
          +{active.length - 1} more
        </span>
      ) : null}
    </div>
  );
}
