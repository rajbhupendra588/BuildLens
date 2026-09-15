"use client";

import {
  DOCUMENT_SCOPE_OPTIONS,
  scopeLabel,
  type DocumentScopeId,
} from "@/types/document-scope";
import { useDocumentScopeStore } from "@/hooks/use-document-scope-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentScopeSelectorProps {
  className?: string;
  compact?: boolean;
}

export function DocumentScopeSelector({
  className,
  compact,
}: DocumentScopeSelectorProps) {
  const { scopeId, scopeSuffix, setScope, clearScopeSuffix } =
    useDocumentScopeStore();

  const label = scopeSuffix
    ? `${scopeLabel(scopeId)} · ${scopeSuffix}`
    : scopeLabel(scopeId);

  return (
    <div className={cn("flex items-center gap-1.5 min-w-0", className)}>
      {!compact ? (
        <span className="text-[11px] text-muted-foreground shrink-0">Scope:</span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-7 max-w-[220px] justify-between gap-1 px-2 text-[11px] font-normal",
              "border-border/80 bg-[var(--enterprise-surface)]",
            )}
          >
            <span className="truncate">{label}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[320px] overflow-y-auto">
          <DropdownMenuLabel className="text-xs">Document scope</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {DOCUMENT_SCOPE_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.id}
              onClick={() => setScope(opt.id as DocumentScopeId)}
              className={cn(scopeId === opt.id && "bg-accent")}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {scopeId !== "all" || scopeSuffix ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground"
          aria-label="Clear scope"
          onClick={() => {
            setScope("all");
            clearScopeSuffix();
          }}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
