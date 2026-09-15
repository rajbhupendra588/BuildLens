"use client";

import type { SourceConflict } from "@/lib/source-conflicts";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConflictStateProps {
  conflict: SourceConflict;
  className?: string;
}

export function ConflictState({ conflict, className }: ConflictStateProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-xs",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="min-w-0 space-y-2">
          <p className="font-medium text-foreground">
            Two documents contain different specifications.
          </p>
          <ul className="space-y-2">
            {conflict.entries.map((entry, i) => (
              <li
                key={`${entry.documentName}-${i}`}
                className="rounded border border-border/60 bg-background/50 px-2 py-1.5"
              >
                <p className="font-medium text-foreground truncate">
                  {entry.documentName}
                </p>
                <p className="text-muted-foreground">{entry.pageLabel}</p>
                {entry.excerpt ? (
                  <p className="mt-1 text-muted-foreground line-clamp-2 leading-relaxed">
                    {entry.excerpt}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
