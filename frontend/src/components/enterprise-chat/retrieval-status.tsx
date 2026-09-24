"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_PHASES = [
  "Searching project documents…",
  "Checking supporting sections…",
  "Verifying the answer…",
];

interface RetrievalStatusProps {
  statusText?: string | null;
  scopeLabel?: string | null;
  className?: string;
}

export function RetrievalStatus({
  statusText,
  scopeLabel,
  className,
}: RetrievalStatusProps) {
  const label =
    statusText && !isInternalStatus(statusText)
      ? statusText
      : DEFAULT_PHASES[0];

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 py-4 font-chat-sans text-[13.5px] text-[var(--chat-muted)]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin shrink-0 mt-0.5 text-[var(--enterprise-accent)]" />
      <div className="min-w-0">
        {scopeLabel ? (
          <p className="mb-0.5 text-[12px] text-foreground">
            Report Scope: {scopeLabel}
          </p>
        ) : null}
        <span>{label}</span>
      </div>
    </div>
  );
}

function isInternalStatus(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("vector") ||
    lower.includes("embedding") ||
    lower.includes("llm") ||
    lower.includes("rag pipeline")
  );
}
