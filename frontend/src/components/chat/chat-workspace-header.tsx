"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { ModelSelector } from "./model-selector";
import { SidebarTrigger } from "../ui/sidebar";
import { cn } from "@/lib/utils";

interface ChatWorkspaceHeaderProps {
  className?: string;
}

export function ChatWorkspaceHeader({ className }: ChatWorkspaceHeaderProps) {
  const [docCount, setDocCount] = useState<number | null>(null);

  const refreshDocCount = () => {
    apiRequest<{ documents: { document_id: string }[] }>("/documents/")
      .then((res) => setDocCount(res.documents.length))
      .catch(() => setDocCount(null));
  };

  useEffect(() => {
    refreshDocCount();
    const onDocsChanged = () => refreshDocCount();
    window.addEventListener("buildlens:documents-changed", onDocsChanged);
    return () =>
      window.removeEventListener("buildlens:documents-changed", onDocsChanged);
  }, []);

  return (
    <header
      className={cn(
        "shrink-0 border-b bg-card/80 backdrop-blur-sm supports-[backdrop-filter]:bg-card/60",
        className,
      )}
    >
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <SidebarTrigger className="md:hidden" />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold tracking-tight text-foreground truncate">
            Chat
          </span>
          <p className="text-[11px] text-muted-foreground truncate">
            Document Q&A with cited sources
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/library"
            className={cn(
              "hidden sm:flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-muted/80",
              docCount && docCount > 0
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-400",
            )}
            title="Open library"
          >
            <ShieldCheck className="size-3.5 shrink-0" />
            {docCount === null ? (
              "Checking library…"
            ) : docCount > 0 ? (
              <>
                <FileText className="size-3 shrink-0" />
                {docCount} document{docCount === 1 ? "" : "s"} indexed
              </>
            ) : (
              "Open library to upload"
            )}
          </Link>
          <ModelSelector />
        </div>
      </div>
    </header>
  );
}
