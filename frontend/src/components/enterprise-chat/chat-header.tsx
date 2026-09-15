"use client";

import Link from "next/link";
import { Search, Settings, FileStack } from "lucide-react";
import { UserMenu } from "@/components/auth/user-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useDocumentScopeStore } from "@/hooks/use-document-scope-store";
import { scopeLabel } from "@/types/document-scope";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { apiRequest } from "@/lib/api";

interface ChatHeaderProps {
  className?: string;
  onOpenSearch?: () => void;
}

export function ChatHeader({ className, onOpenSearch }: ChatHeaderProps) {
  const { scopeId, scopeSuffix } = useDocumentScopeStore();
  const { workspace } = useWorkspace();
  const [docCount, setDocCount] = useState<number | null>(null);

  const scopeDisplay = scopeSuffix
    ? `${scopeLabel(scopeId)} · ${scopeSuffix}`
    : scopeId === "all"
      ? "All Project Documents"
      : scopeLabel(scopeId);

  useEffect(() => {
    const refresh = () => {
      apiRequest<{ documents: unknown[] }>("/documents/")
        .then((res) => setDocCount(res.documents?.length ?? 0))
        .catch(() => setDocCount(null));
    };
    refresh();
    window.addEventListener("buildlens:documents-changed", refresh);
    return () => window.removeEventListener("buildlens:documents-changed", refresh);
  }, []);

  const projectTitle = workspace?.project_name ?? "BuildLens Workspace";
  const projectSubtitle =
    workspace?.project_subtitle ??
    "Construction Project · Document intelligence";

  return (
    <header
      className={cn(
        "shrink-0 border-b border-border bg-[var(--enterprise-surface)] h-14 md:h-16",
        className,
      )}
    >
      <div className="flex h-full items-center gap-3 px-4 md:px-5">
        <SidebarTrigger className="lg:hidden shrink-0" />

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-[15px] font-semibold tracking-tight">
              {projectTitle}
            </span>
            <span
              className={cn(
                "hidden sm:inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium border",
                docCount && docCount > 0
                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/30 text-amber-700 dark:text-amber-400",
              )}
              title="Indexed documents in library"
            >
              {docCount === null
                ? "Checking…"
                : docCount > 0
                  ? `${docCount} indexed`
                  : "No documents"}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {projectSubtitle}
          </p>
        </div>

        <div className="hidden md:flex items-center gap-2 min-w-0 max-w-[280px] px-3 py-1.5 rounded-md border border-border/60 bg-background/40">
          <FileStack className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-[12px] text-muted-foreground">
            {scopeDisplay}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Search documents and conversations"
            title="Search (⌘K)"
            onClick={onOpenSearch}
          >
            <Search className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Document library"
            asChild
          >
            <Link href="/library">
              <FileStack className="size-4" />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Settings"
            asChild
          >
            <Link href="/settings">
              <Settings className="size-4" />
            </Link>
          </Button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
