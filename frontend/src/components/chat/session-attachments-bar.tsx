"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useChatStore } from "@/hooks/use-chat-store";
import { cn } from "@/lib/utils";

interface SessionAttachmentRow {
  id: string;
  document_id: string;
  file_name: string;
  index_status: string;
  preview_chars: number;
}

export function SessionAttachmentsBar() {
  const { currentSessionId } = useChatStore();
  const [rows, setRows] = useState<SessionAttachmentRow[]>([]);

  const load = useCallback(async () => {
    if (!currentSessionId) {
      setRows([]);
      return;
    }
    try {
      const data = await apiRequest<SessionAttachmentRow[]>(
        `/chat/sessions/${currentSessionId}/attachments`,
      );
      setRows(data);
    } catch {
      setRows([]);
    }
  }, [currentSessionId]);

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

  if (!currentSessionId || rows.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-b bg-muted/30 px-4 py-2 md:px-8">
      {rows.map((row) => (
        <div
          key={row.id}
          className={cn(
            "inline-flex max-w-xs items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs",
          )}
          title={
            row.index_status === "indexed"
              ? "Indexed for library search"
              : row.index_status === "quick_ready"
                ? "Quick preview — you can chat now"
                : "Indexing for library search…"
          }
        >
          <FileText className="size-3 shrink-0 text-primary" />
          <span className="truncate">{row.file_name}</span>
          {row.index_status !== "indexed" && row.index_status !== "error" ? (
            <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
