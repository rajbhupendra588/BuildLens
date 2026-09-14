"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Copy, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function AsciiArtBlock({ code }: { code: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [code]);

  return (
    <div className="my-4 rounded-xl border border-border bg-muted/40 text-sm">
      <div className="flex items-start gap-2 px-4 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Dense text diagram hidden
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            This reply used ASCII box art, which is hard to read in chat. Ask for a
            structured summary with headings, bullets, tables, or a Mermaid diagram
            instead.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Copy hidden diagram text"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-border/60 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        {expanded ? (
          <>
            <ChevronUp className="size-3.5" />
            Hide raw text
          </>
        ) : (
          <>
            <ChevronDown className="size-3.5" />
            Show raw text
          </>
        )}
      </button>
      {expanded ? (
        <pre
          className={cn(
            "max-h-64 overflow-auto border-t border-border/60 px-4 py-3 font-mono text-[0.7rem] leading-snug text-muted-foreground",
          )}
        >
          {code}
        </pre>
      ) : null}
    </div>
  );
}
