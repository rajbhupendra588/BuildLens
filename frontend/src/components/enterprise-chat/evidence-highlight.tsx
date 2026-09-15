"use client";

import { cn } from "@/lib/utils";

interface EvidenceHighlightProps {
  excerpt?: string | null;
  className?: string;
}

/** Text excerpt callout when PDF page cannot highlight a region precisely. */
export function EvidenceHighlight({ excerpt, className }: EvidenceHighlightProps) {
  if (!excerpt?.trim()) return null;

  return (
    <div
      className={cn(
        "mx-3 mb-3 rounded-md border border-[var(--enterprise-accent)]/35 bg-[var(--enterprise-accent)]/8 px-3 py-2",
        className,
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
        Retrieved excerpt
      </p>
      <p className="text-[12px] leading-relaxed text-foreground/90">{excerpt}</p>
    </div>
  );
}
