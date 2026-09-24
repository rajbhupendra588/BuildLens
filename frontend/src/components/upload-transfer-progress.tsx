"use client";

import { useEffect, useState } from "react";
import { formatFileSize } from "@/lib/collect-dropped-files";
import {
  estimateRemainingSeconds,
  formatUploadEta,
} from "@/lib/upload-progress";
import { cn } from "@/lib/utils";
import { UploadItem } from "@/types/document";

interface UploadTransferProgressProps {
  item: Pick<
    UploadItem,
    | "file"
    | "progress"
    | "bytesLoaded"
    | "bytesTotal"
    | "uploadStartedAt"
    | "status"
  >;
  className?: string;
  /** Hide filename — parent already shows it */
  hideName?: boolean;
  compact?: boolean;
}

export function UploadTransferProgress({
  item,
  className,
  hideName = false,
  compact = false,
}: UploadTransferProgressProps) {
  const [now, setNow] = useState(() => Date.now());
  const startedAt = item.uploadStartedAt;
  const isUploading = item.status === "uploading";

  useEffect(() => {
    if (!isUploading || !startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isUploading, startedAt, item.progress]);

  const percent = Math.min(100, Math.max(0, Math.round(item.progress)));
  const loaded = item.bytesLoaded ?? 0;
  const total = item.bytesTotal || item.file.size;
  const etaSeconds =
    isUploading && startedAt
      ? estimateRemainingSeconds(loaded, total, startedAt, now)
      : null;
  const etaLabel =
    percent >= 100
      ? "Finishing…"
      : formatUploadEta(etaSeconds) ??
        (percent < 1 ? "Starting…" : "Estimating time…");
  const sizeLabel =
    total > 0 ? `${formatFileSize(loaded)} of ${formatFileSize(total)}` : null;

  return (
    <div className={cn("min-w-0 w-full", className)}>
      {!hideName ? (
        <p className={cn("truncate font-medium text-foreground", compact ? "text-xs" : "text-sm")}>
          {item.file.name}
        </p>
      ) : null}
      <div
        className={cn(
          "overflow-hidden rounded-full bg-muted",
          compact ? "mt-1 h-1.5" : "mt-1.5 h-2",
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`Uploading ${item.file.name}, ${percent} percent${etaLabel ? `, ${etaLabel}` : ""}`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div
        className={cn(
          "mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-muted-foreground",
          compact ? "text-[10px] leading-tight" : "text-xs",
        )}
      >
        <span className="tabular-nums font-medium text-foreground">
          {percent}%
        </span>
        <span className="min-w-0 truncate text-right">
          {[sizeLabel, etaLabel].filter(Boolean).join(" · ")}
        </span>
      </div>
    </div>
  );
}
