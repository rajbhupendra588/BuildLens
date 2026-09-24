"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useActiveChatSessionId } from "@/lib/active-chat-session";
import { useUploadQueueStore } from "@/stores/upload-queue-store";
import { cn } from "@/lib/utils";
import { useChatDocumentPreview } from "./chat-document-preview-context";
import { toast } from "sonner";
import { isAttachmentStillLoading } from "@/lib/session-attachment-status";

export interface SessionAttachmentRow {
  id: string;
  document_id: string;
  file_name: string;
  index_status: string;
  chat_ready?: boolean;
  preview_chars: number;
}

interface ComposerAttachmentsProps {
  onAttachmentsChange?: (count: number) => void;
  className?: string;
  /** Render inside the unified composer card (Cursor-style pills). */
  integrated?: boolean;
}

export function ComposerAttachments({
  onAttachmentsChange,
  className,
  integrated,
}: ComposerAttachmentsProps) {
  const activeSessionId = useActiveChatSessionId();
  const { openPreview } = useChatDocumentPreview();
  const uploadQueue = useUploadQueueStore((s) => s.uploadQueue);
  const [rows, setRows] = useState<SessionAttachmentRow[]>([]);

  const sessionUploads = uploadQueue.filter(
    (item) =>
      item.sessionId === activeSessionId &&
      item.status !== "done" &&
      item.status !== "error",
  );
  const pendingUploads = sessionUploads.filter(
    (item) => item.status !== "uploading",
  );

  const load = useCallback(async () => {
    if (!activeSessionId) {
      setRows([]);
      return;
    }
    try {
      const data = await apiRequest<SessionAttachmentRow[]>(
        `/chat/sessions/${activeSessionId}/attachments`,
      );
      setRows(data);
    } catch {
      setRows([]);
    }
  }, [activeSessionId]);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener("buildlens:session-attachments-changed", onChange);
    window.addEventListener("buildlens:documents-changed", onChange);
    return () => {
      window.removeEventListener(
        "buildlens:session-attachments-changed",
        onChange,
      );
      window.removeEventListener("buildlens:documents-changed", onChange);
    };
  }, [load]);

  useEffect(() => {
    const stillIndexing = rows.some((r) => isAttachmentStillLoading(r.index_status));
    if (!stillIndexing) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [rows, load]);

  useEffect(() => {
    onAttachmentsChange?.(rows.length + sessionUploads.length);
  }, [rows.length, sessionUploads.length, onAttachmentsChange]);

  const handleRemove = async (row: SessionAttachmentRow) => {
    if (!activeSessionId) return;
    try {
      await apiRequest(
        `/chat/sessions/${activeSessionId}/attachments/${row.id}`,
        { method: "DELETE" },
      );
      window.dispatchEvent(new CustomEvent("buildlens:session-attachments-changed"));
      toast.message(`Removed ${row.file_name} from this chat`);
    } catch {
      toast.error("Could not remove file from conversation");
    }
  };

  if (!activeSessionId || (rows.length === 0 && sessionUploads.length === 0)) {
    return null;
  }

  const pillClass = integrated
    ? "inline-flex max-w-[min(100%,280px)] items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-foreground/90"
    : "inline-flex max-w-[240px] items-center gap-1 rounded-full border bg-muted/40 pl-2 pr-1 py-0.5 text-xs";

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {pendingUploads.map((item) => (
        <div
          key={item.id}
          className={cn(
            pillClass,
            integrated && "border border-dashed border-border/60",
          )}
        >
          <FileText className="size-3 shrink-0" />
          <span className="truncate">{item.file.name}</span>
          <Loader2 className="size-3 shrink-0 animate-spin" />
        </div>
      ))}
      {rows.map((row) => (
        <div key={row.id} className={pillClass}>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 hover:text-primary"
            title="Open preview"
            onClick={() =>
              openPreview({
                documentId: row.document_id,
                fileName: row.file_name,
              })
            }
          >
            <FileText className="size-3 shrink-0 text-primary" />
            <span className="truncate">{row.file_name}</span>
            {isAttachmentStillLoading(row.index_status) ? (
              <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : null}
          </button>
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Remove from chat"
            onClick={() => void handleRemove(row)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
