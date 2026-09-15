"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface RetrievalTraceProps {
  query: string;
  documentsSearched: number;
  relevantDocuments: number;
  retrievedSections: number;
  selectedEvidence: number;
  className?: string;
}

export function RetrievalTrace({
  query,
  documentsSearched,
  relevantDocuments,
  retrievedSections,
  selectedEvidence,
  className,
}: RetrievalTraceProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("mt-3 text-xs", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        Retrieval details
      </button>
      {open ? (
        <dl className="mt-2 space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-muted-foreground">
          <div className="flex justify-between gap-4">
            <dt>Query</dt>
            <dd className="text-foreground text-right truncate max-w-[60%]">{query}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Documents searched</dt>
            <dd className="text-foreground tabular-nums">{documentsSearched}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Relevant documents</dt>
            <dd className="text-foreground tabular-nums">{relevantDocuments}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Retrieved sections</dt>
            <dd className="text-foreground tabular-nums">{retrievedSections}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Selected evidence</dt>
            <dd className="text-foreground tabular-nums">{selectedEvidence}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
