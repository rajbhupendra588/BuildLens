"use client";

import { MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";

const SUGGESTED_QUERIES = [
  "/report",
  "What is the foundation depth for Tower B?",
  "Which concrete grade is specified for the columns?",
  "What is the electrical load for Block A?",
  "Show me the fire safety requirements.",
];

interface EmptyStateProps {
  onSelectSuggestion: (text: string) => void;
  className?: string;
}

export function EmptyState({ onSelectSuggestion, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col py-10 md:py-14 text-left",
        className,
      )}
    >
      <div className="mb-6 flex size-10 items-center justify-center rounded-lg border border-border/80 bg-[var(--enterprise-elevated)] text-[var(--enterprise-accent)]">
        <MessageSquareText className="size-5" aria-hidden />
      </div>
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        Ask anything about your project documents
      </h2>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
        Upload construction documents and get answers grounded in the source
        material. Every response links to the page and excerpt you can verify.
      </p>

      <div className="mt-8">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Suggested queries
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {SUGGESTED_QUERIES.map((query) => (
            <li key={query}>
              <button
                type="button"
                onClick={() => onSelectSuggestion(query)}
                className={cn(
                  "w-full rounded-lg border border-border/80 bg-[var(--enterprise-surface)] px-3 py-2.5",
                  "text-left text-[13px] leading-snug text-foreground/90",
                  "hover:border-[var(--enterprise-strong-border)] hover:bg-[var(--enterprise-elevated)]",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {query}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
