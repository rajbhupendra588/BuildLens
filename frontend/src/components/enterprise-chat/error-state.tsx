"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatErrorKind =
  | "no_evidence"
  | "processing"
  | "unavailable"
  | "search_failed"
  | "generic";

interface ErrorStateProps {
  kind?: ChatErrorKind;
  message?: string;
  onSearchAll?: () => void;
  onSelectDocument?: () => void;
  onUpload?: () => void;
  className?: string;
}

const DEFAULT_MESSAGES: Record<ChatErrorKind, string> = {
  no_evidence:
    "I couldn't find enough evidence in the selected documents to answer this question.",
  processing:
    "Documents are still being processed. You can ask again once indexing completes.",
  unavailable: "The referenced document is unavailable.",
  search_failed: "Document search failed temporarily. Please try again.",
  generic: "Something went wrong while retrieving an answer.",
};

export function ErrorState({
  kind = "generic",
  message,
  onSearchAll,
  onSelectDocument,
  onUpload,
  className,
}: ErrorStateProps) {
  const text = message ?? DEFAULT_MESSAGES[kind];

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-[var(--enterprise-surface)] px-4 py-3 text-[13px]",
        className,
      )}
      role="alert"
    >
      <p className="text-foreground leading-relaxed">{text}</p>
      {(onSearchAll || onSelectDocument || onUpload) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onSearchAll ? (
            <Button type="button" size="sm" variant="secondary" onClick={onSearchAll}>
              Search all project documents
            </Button>
          ) : null}
          {onSelectDocument ? (
            <Button type="button" size="sm" variant="outline" onClick={onSelectDocument}>
              Select another document
            </Button>
          ) : null}
          {onUpload ? (
            <Button type="button" size="sm" variant="outline" onClick={onUpload}>
              Upload documentation
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
