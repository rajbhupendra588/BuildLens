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
      className={cn(
        "chat-user group/msg flex w-full flex-col items-end py-4 md:py-5",
        className,
      )}
      aria-label="Your question"
    >
      {editing ?? (
        <div className="max-w-[min(100%,40rem)] text-right">
          <div className="chat-user-bubble rounded-2xl rounded-br-md px-4 py-2.5 text-left">
            <p className="text-[16px] leading-[1.55] font-medium tracking-[-0.01em] text-[var(--chat-user-text)] whitespace-pre-wrap">
              {content}
            </p>
          </div>
          {(sourceLabels?.length || scopeLabel || reportScope) && (
            <div className="mt-2 text-[12px] text-[var(--chat-muted)] space-y-1">
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
        </div>
      )}
      {(timestamp || actions) && (
        <div className="mt-1.5 flex items-center justify-end gap-2">
          {timestamp}
          {actions}
        </div>
      )}
    </article>
  );
}
