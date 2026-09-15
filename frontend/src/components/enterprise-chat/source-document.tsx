"use client";

import type { SourceItem } from "@/types/chat";
import { formatSourceLocation } from "@/lib/source-location";
import { cn } from "@/lib/utils";

interface SourceDocumentProps {
  source: SourceItem;
  index: number;
  active?: boolean;
  onSelect?: () => void;
}

export function SourceDocument({
  source,
  index,
  active,
  onSelect,
}: SourceDocumentProps) {
  const location = formatSourceLocation(source);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-md border px-3 py-2 transition-colors",
        active
          ? "border-[var(--enterprise-accent)]/50 bg-[var(--enterprise-accent)]/10"
          : "border-border/60 hover:border-border hover:bg-muted/30",
      )}
    >
      <p className="text-[11px] text-muted-foreground tabular-nums">[{index}]</p>
      <p className="text-[13px] font-medium truncate text-foreground">
        {source.file_name}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
        {location}
      </p>
      {source.is_image && source.section_title ? (
        <p className="text-[11px] text-muted-foreground mt-1">
          Region: {source.section_title}
        </p>
      ) : null}
    </button>
  );
}
