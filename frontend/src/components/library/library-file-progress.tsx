"use client";

import { useEffect, useState } from "react";
import { UploadTransferProgress } from "@/components/upload-transfer-progress";
import { formatElapsedClock } from "@/lib/upload-progress";
import { cn } from "@/lib/utils";
import { LibraryDocument, UploadItem } from "@/types/document";

export function matchLibraryUpload(
  doc: LibraryDocument,
  queue: UploadItem[],
): UploadItem | undefined {
  return queue.find(
    (item) =>
      !item.sessionId &&
      item.file.name === doc.file_name &&
      (item.status === "pending" ||
        item.status === "uploading" ||
        item.status === "processing"),
  );
}

function useElapsed(startedAtMs?: number): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAtMs) return;
    const tick = () => setElapsed(Math.max(0, Date.now() - startedAtMs));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs]);
  return elapsed;
}

function IndexingBar({
  doc,
  startedAtMs,
  compact = false,
}: {
  doc: LibraryDocument;
  startedAtMs?: number;
  compact?: boolean;
}) {
  const elapsed = useElapsed(startedAtMs);
  const queued =
    doc.ingest_status === "queued" ||
    (!startedAtMs && doc.ingest_status !== "processing");
  const isXlsx = /\.(xlsx|xls|csv)$/i.test(doc.file_name);
  const detail = queued
    ? "One file at a time — this one hasn’t started yet"
    : elapsed > 0
      ? `${formatElapsedClock(elapsed)} so far${
          isXlsx ? " · large spreadsheets can take several minutes" : ""
        }`
      : "Reading and embedding the file…";

  return (
    <div className={cn("min-w-0 w-full", compact && "text-[10px]")}>
      <div
        className={cn(
          "overflow-hidden rounded-full bg-muted",
          compact ? "h-1.5" : "h-2",
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          queued
            ? `Waiting to index ${doc.file_name}`
            : `Indexing ${doc.file_name}`
        }
      >
        <div className="h-full w-2/5 rounded-full bg-primary/80 animate-bl-indet" />
      </div>
      <div
        className={cn(
          "mt-1 flex items-baseline justify-between gap-2 text-muted-foreground",
          compact ? "text-[10px] leading-tight" : "text-xs",
        )}
      >
        <span className="shrink-0 font-medium text-foreground">
          {queued ? "Waiting" : "Indexing"}
        </span>
        <span className="min-w-0 truncate text-right">{detail}</span>
      </div>
    </div>
  );
}

interface LibraryFileProgressProps {
  doc: LibraryDocument;
  uploadItem?: UploadItem;
  className?: string;
  compact?: boolean;
}

export function LibraryFileProgress({
  doc,
  uploadItem,
  className,
  compact = false,
}: LibraryFileProgressProps) {
  const uploading = uploadItem?.status === "uploading";
  const indexing = doc.index_status === "indexing";
  if (!uploading && !indexing) return null;

  const startedAtMs = Date.parse(doc.index_started_at ?? "");

  return (
    <div className={cn("min-w-0", className)}>
      {uploading && uploadItem ? (
        <UploadTransferProgress item={uploadItem} compact={compact} hideName />
      ) : (
        <IndexingBar
          doc={doc}
          startedAtMs={Number.isFinite(startedAtMs) ? startedAtMs : undefined}
          compact={compact}
        />
      )}
    </div>
  );
}
