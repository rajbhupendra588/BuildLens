"use client";

import { Layers, FileText, X } from "lucide-react";
import { DocumentScopeSelector } from "./document-scope-selector";
import { ComposerAttachments } from "@/components/chat/composer-attachments";
import { cn } from "@/lib/utils";
import { useReportStore } from "@/hooks/use-report-store";
import { Button } from "@/components/ui/button";

interface AddedContextStripProps {
  onAttachmentCountChange?: (count: number) => void;
  attachmentCount?: number;
  className?: string;
}

/** Scope + session files that ground the next message (shown above the composer). */
export function AddedContextStrip({
  onAttachmentCountChange,
  attachmentCount = 0,
  className,
}: AddedContextStripProps) {
  const activeReportId = useReportStore((s) => s.activeReportId);
  const activeReportTitle = useReportStore((s) => s.activeReportTitle);
  const clearActiveReport = useReportStore((s) => s.clearActiveReport);

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--enterprise-border)]/80",
        "bg-[var(--enterprise-elevated)]/60 px-2.5 py-2",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Layers className="size-3.5 text-[var(--enterprise-accent)]" />
        Added context
      </div>

      {activeReportId ? (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--enterprise-accent)]/25 bg-[var(--enterprise-accent)]/5 px-2 py-1.5">
          <FileText className="size-3.5 shrink-0 text-[var(--enterprise-accent)]" />
          <span className="min-w-0 flex-1 truncate text-[12px]">
            Context: Generated Report
            {activeReportTitle ? ` · ${activeReportTitle}` : ""}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Remove report context"
            onClick={clearActiveReport}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <DocumentScopeSelector compact className="shrink-0" />
        <div className="hidden h-4 w-px bg-border/60 sm:block" aria-hidden />
        <div className="min-w-0 flex-1">
          <ComposerAttachments onAttachmentsChange={onAttachmentCountChange} />
          {attachmentCount === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground px-0.5">
              No files attached — answers search your indexed library for the
              scope above.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
