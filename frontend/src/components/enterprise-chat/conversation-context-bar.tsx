"use client";

import type { SourceItem } from "@/types/chat";
import { cn } from "@/lib/utils";

interface ConversationContextBarProps {
  sources: SourceItem[];
  className?: string;
}

/** Shows which documents are anchoring the current conversation turn. */
export function ConversationContextBar({
  sources,
  className,
}: ConversationContextBarProps) {
  if (!sources.length) return null;

  const names = [...new Set(sources.map((s) => s.file_name))].slice(0, 3);
  const extra = sources.length - names.length;

  return (
    <p
      className={cn(
        "text-[11px] text-muted-foreground border-b border-border/50 pb-2",
        className,
      )}
    >
      <span className="font-medium text-foreground/80">Conversation context:</span>{" "}
      {names.join(" · ")}
      {extra > 0 ? ` · +${extra} more` : null}
    </p>
  );
}
