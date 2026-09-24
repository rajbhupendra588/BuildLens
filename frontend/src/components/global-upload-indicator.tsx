"use client";

import { Loader2 } from "lucide-react";
import { useUploadQueueStore } from "@/stores/upload-queue-store";
import { UploadTransferProgress } from "@/components/upload-transfer-progress";
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
      : current.status === "pending"
        ? `Queued: ${current.file.name}`
        : null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 z-50 -translate-x-1/2",
        "w-[min(24rem,calc(100vw-2rem))] rounded-2xl border bg-card px-4 py-3 shadow-lg",
        "text-xs text-foreground",
      )}
      role="status"
      aria-live="polite"
    >
      {current.status === "uploading" ? (
        <div className="flex items-start gap-2">
          <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
          <UploadTransferProgress item={current} compact className="flex-1" />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          <span className="truncate">{label}</span>
        </div>
      )}
      {active.length > 1 ? (
        <p className="mt-1.5 pl-5 text-muted-foreground">
          +{active.length - 1} more
        </p>
      ) : null}
    </div>
  );
}
