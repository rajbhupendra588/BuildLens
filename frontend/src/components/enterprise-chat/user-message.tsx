"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface UserMessageProps {
  content: string;
  sourceLabels?: string[];
  scopeLabel?: string;
  reportScope?: string;
  timestamp?: ReactNode;
  actions?: ReactNode;
  editing?: ReactNode;
  className?: string;
}

export function UserMessage({
  content,
  sourceLabels,
  scopeLabel,
  reportScope,
  timestamp,
  actions,
  editing,
  className,
}: UserMessageProps) {
  return (
    <article
      className={cn("group/msg w-full py-2.5 md:py-3", className)}
      aria-label="Your question"
    >
      {editing ?? (
        <>
          <p className="text-[15px] leading-[1.6] font-medium text-foreground whitespace-pre-wrap">
            {content}
          </p>
          {(sourceLabels?.length || scopeLabel || reportScope) && (
            <div className="mt-2 text-[12px] text-muted-foreground space-y-1">
              {reportScope ? (
                <p>
                  <span className="text-muted-foreground/80">Report Scope: </span>
                  {reportScope}
                </p>
              ) : null}
              {scopeLabel ? (
                <p>
                  <span className="text-muted-foreground/80">Scope: </span>
                  {scopeLabel}
                </p>
              ) : null}
              {sourceLabels && sourceLabels.length > 0 ? (
                <p>
                  <span className="text-muted-foreground/80">Sources: </span>
                  {sourceLabels.join(" · ")}
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
      {(timestamp || actions) && (
        <div className="mt-1.5 flex items-center gap-2">{timestamp}{actions}</div>
      )}
    </article>
  );
}
