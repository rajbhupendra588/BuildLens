"use client";

import { Download, FileText, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReportMedia } from "@/types/report";

interface ReportCardProps {
  media: ReportMedia;
  onOpen: () => void;
  onAsk: () => void;
  onDownload: () => void;
  className?: string;
}

export function ReportCard({
  media,
  onOpen,
  onAsk,
  onDownload,
  className,
}: ReportCardProps) {
  const scope =
    media.document_names?.length === 1
      ? media.document_names[0]
      : media.document_names?.length
        ? `${media.document_names.length} selected documents`
        : media.title ?? "Uploaded documents";

  return (
    <div
      className={cn(
        "mb-3 rounded-md border border-border/80 bg-[var(--enterprise-surface)] p-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-[var(--enterprise-elevated)] text-[var(--enterprise-accent)]">
          <FileText className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            Document Report
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Generated from: {scope}
            {media.page_count ? ` · ${media.page_count} pages` : ""}
          </p>
          {media.limitations ? (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
              {media.limitations}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onOpen}>
              Open report
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onDownload}>
              <Download className="size-3.5" />
              Download PDF
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onAsk}>
              <MessageSquare className="size-3.5" />
              Ask about this report
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
