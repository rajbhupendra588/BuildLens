"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  FolderOpen,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileIcon } from "@/components/library/file-icon";
import { DOCUMENT_ACCEPT } from "@/lib/document-upload";
import { cn } from "@/lib/utils";
import { UploadItem } from "@/types/document";

interface UploadDropzoneProps {
  isDragging: boolean;
  isQueueActive: boolean;
  uploadQueue: UploadItem[];
  doneCount: number;
  totalCount: number;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  dirInputRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDirInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenFilePicker: () => void;
  compact?: boolean;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

function IndexingStatus({
  fileName,
  startedAt,
}: {
  fileName: string;
  startedAt?: number;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const isPdf = fileName.toLowerCase().endsWith(".pdf");
  const longWait = elapsed >= 60_000;

  return (
    <span
      className={cn(
        "text-xs text-amber-600 dark:text-amber-400 text-right leading-tight",
        longWait ? "max-w-[11rem]" : "max-w-[9rem]",
      )}
    >
      Indexing
      {startedAt ? ` · ${formatElapsed(elapsed)}` : "…"}
      {isPdf && longWait ? (
        <span className="block text-[10px] text-muted-foreground font-normal">
          Still running—scanned PDFs use slower OCR; cancel and retry if stuck
        </span>
      ) : null}
    </span>
  );
}

export function UploadDropzone({
  isDragging,
  isQueueActive,
  uploadQueue,
  doneCount: _doneCount,
  totalCount,
  fileInputRef,
  dirInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onInputChange,
  onDirInputChange,
  onOpenFilePicker,
  compact = false,
}: UploadDropzoneProps) {
  const queueSummary = useMemo(() => {
    const done = uploadQueue.filter((i) => i.status === "done").length;
    const indexing = uploadQueue.filter((i) => i.status === "processing").length;
    const uploading = uploadQueue.filter((i) => i.status === "uploading").length;
    const pending = uploadQueue.filter((i) => i.status === "pending").length;
    const failed = uploadQueue.filter((i) => i.status === "error").length;
    return { done, indexing, uploading, pending, failed };
  }, [uploadQueue]);

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onOpenFilePicker}
      className={cn(
        "rounded-xl border-2 border-dashed transition-colors select-none cursor-pointer",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
      )}
    >
      <input
        type="file"
        multiple
        className="hidden"
        ref={fileInputRef}
        onChange={onInputChange}
        accept={DOCUMENT_ACCEPT}
      />
      <input
        type="file"
        multiple
        className="hidden"
        ref={dirInputRef}
        onChange={onDirInputChange}
      />

      {isQueueActive ? (
        <div className={cn("p-4", compact && "p-3")}>
          <div className="mb-3 space-y-1">
            <p className="text-xs font-medium text-foreground">
              {queueSummary.done} of {totalCount} complete
              {queueSummary.indexing > 0
                ? ` · ${queueSummary.indexing} indexing`
                : ""}
              {queueSummary.uploading > 0
                ? ` · ${queueSummary.uploading} uploading`
                : ""}
              {queueSummary.pending > 0
                ? ` · ${queueSummary.pending} queued`
                : ""}
            </p>
            {queueSummary.indexing > 0 || queueSummary.pending > 0 ? (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Upload finishes at 100% quickly; indexing runs one file at a
                time. Text PDFs usually finish in seconds—scanned PDFs may take
                longer (OCR).
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
            {uploadQueue.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <FileIcon name={item.file.name} className="shrink-0" />
                <span
                  className="text-sm truncate min-w-0 flex-1"
                  title={item.file.name}
                >
                  {item.file.name}
                </span>
                <div className="flex items-center gap-2 shrink-0 min-w-[9rem] max-w-[11rem] justify-end">
                  {item.status === "uploading" && (
                    <>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-150"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-blue-500 w-20 text-right">
                        {item.progress}% uploading
                      </span>
                    </>
                  )}
                  {item.status === "processing" && (
                    <>
                      <Loader2 className="size-3.5 animate-spin text-amber-500 shrink-0" />
                      <IndexingStatus
                        fileName={item.file.name}
                        startedAt={item.processingStartedAt}
                      />
                    </>
                  )}
                  {item.status === "done" && (
                    <>
                      <Check className="size-3.5 text-green-500 shrink-0" />
                      <span className="text-xs text-green-500">Done</span>
                    </>
                  )}
                  {item.status === "error" && (
                    <>
                      <X className="size-3.5 text-destructive shrink-0" />
                      <span
                        className="text-xs text-destructive truncate max-w-[100px]"
                        title={item.error}
                      >
                        {item.error ?? "Error"}
                      </span>
                    </>
                  )}
                  {item.status === "pending" && (
                    <>
                      <div className="size-2 rounded-full bg-muted-foreground/40 shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        Pending
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Click or drop more files / folders to add to queue
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-2 px-4",
            compact ? "py-5" : "py-8",
          )}
        >
          <UploadCloud
            className={cn(
              "transition-colors",
              compact ? "size-6" : "size-8",
              isDragging ? "text-primary" : "text-muted-foreground",
            )}
          />
          <p className="text-sm font-medium">
            {isDragging
              ? "Drop files or folders here"
              : "Drag files or folders here"}
          </p>
          <p className="text-xs text-muted-foreground text-center">
            PDF recommended · DOCX, spreadsheets, images · up to 1 GB · folders
            supported
          </p>
          {!isDragging && (
            <div className="flex items-center gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Choose Files
              </Button>
              <span className="text-xs text-muted-foreground">or</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  dirInputRef.current?.click();
                }}
              >
                <FolderOpen className="size-3 mr-1" />
                Choose Folder
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
