"use client";

import { Copy, Check, FileSearch, ExternalLink, RotateCcw, Flag } from "lucide-react";
import { useState, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SourceItem } from "@/types/chat";
import { cn } from "@/lib/utils";

interface AnswerActionsProps {
  content: string;
  sources?: SourceItem[];
  onViewSources?: () => void;
  onOpenDocument?: (source: SourceItem) => void;
  onRegenerate?: () => void;
  disabled?: boolean;
  className?: string;
}

export function AnswerActions({
  content,
  sources,
  onViewSources,
  onOpenDocument,
  onRegenerate,
  disabled,
  className,
}: AnswerActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [content]);

  const primarySource = sources?.find((s) => s.document_id);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity",
        className,
      )}
    >
      <ActionButton label={copied ? "Copied" : "Copy"} onClick={() => void handleCopy()} disabled={disabled || !content}>
        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      </ActionButton>
      {sources && sources.length > 0 && onViewSources ? (
        <ActionButton
          label="Sources & evidence"
          onClick={onViewSources}
          disabled={disabled}
        >
          <FileSearch className="size-3.5" />
        </ActionButton>
      ) : null}
      {primarySource && onOpenDocument ? (
        <ActionButton
          label="Open document"
          onClick={() => onOpenDocument(primarySource)}
          disabled={disabled}
        >
          <ExternalLink className="size-3.5" />
        </ActionButton>
      ) : null}
      {onRegenerate ? (
        <ActionButton label="Regenerate" onClick={onRegenerate} disabled={disabled}>
          <RotateCcw className="size-3.5" />
        </ActionButton>
      ) : null}
      <ActionButton
        label="Report issue"
        onClick={() => {
          window.open("mailto:support@buildlens.local?subject=Answer%20issue", "_blank");
        }}
        disabled={disabled}
      >
        <Flag className="size-3.5" />
      </ActionButton>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
          className="text-muted-foreground hover:text-foreground"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
