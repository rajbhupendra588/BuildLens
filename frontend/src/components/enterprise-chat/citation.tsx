"use client";

import type { SourceItem } from "@/types/chat";
import { formatSourceLocation } from "@/lib/source-location";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface CitationProps {
  index: number;
  source: SourceItem;
  active?: boolean;
  onSelect?: (source: SourceItem, index: number) => void;
}

export function Citation({ index, source, active, onSelect }: CitationProps) {
  const location = formatSourceLocation(source);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex align-super text-[11px] font-medium tabular-nums",
            "rounded px-1 py-px mx-0.5 transition-colors",
            "text-[var(--enterprise-accent)] hover:bg-[var(--enterprise-accent)]/10",
            active && "bg-[var(--enterprise-accent)]/15 ring-1 ring-[var(--enterprise-accent)]/40",
          )}
          aria-label={`Source ${index}: ${source.file_name}, ${location}`}
          onClick={() => onSelect?.(source, index)}
        >
          [{index}]
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-sm text-left space-y-1.5 p-3"
      >
        <p className="text-[11px] font-medium text-foreground">Document</p>
        <p className="text-xs text-muted-foreground break-words">
          {source.file_name}
        </p>
        <p className="text-[11px] font-medium text-foreground pt-1">Location</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {location}
        </p>
        {source.section_title ? (
          <>
            <p className="text-[11px] font-medium text-foreground pt-1">
              Section
            </p>
            <p className="text-xs text-muted-foreground">
              {source.section_title}
            </p>
          </>
        ) : null}
        {source.snippet ? (
          <>
            <p className="text-[11px] font-medium text-foreground pt-1">
              Excerpt
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
              {source.snippet}
            </p>
          </>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
