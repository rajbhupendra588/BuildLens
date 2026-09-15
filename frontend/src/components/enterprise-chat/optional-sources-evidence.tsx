"use client";

import type { SourceItem } from "@/types/chat";
import { formatSourceLocation } from "@/lib/source-location";
import {
  BookOpen,
  ChevronDown,
  FileSearch,
  FileText,
  Quote,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Citation } from "./citation";
import { cn } from "@/lib/utils";

export interface OptionalSourcesEvidenceProps {
  sources: SourceItem[];
  activeIndex?: number | null;
  onOpenSource?: (source: SourceItem, index: number) => void;
  className?: string;
  /** Controlled open state for the whole block. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenInPanel?: () => void;
}

function SectionToggle({
  id,
  title,
  icon: Icon,
  subtitle,
  expanded,
  onToggle,
  children,
  lazyMounted,
}: {
  id: string;
  title: string;
  icon: typeof BookOpen;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  lazyMounted: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 overflow-hidden">
      <button
        type="button"
        id={`${id}-trigger`}
        aria-expanded={expanded}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          {subtitle ? (
            <span className="block text-[11px] text-muted-foreground truncate">
              {subtitle}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {lazyMounted ? (
            <div className="border-t border-border/50 px-3 py-2.5">{children}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OptionalSourcesEvidence({
  sources,
  activeIndex,
  onOpenSource,
  className,
  open: controlledOpen,
  onOpenChange,
  onOpenInPanel,
}: OptionalSourcesEvidenceProps) {
  const rootId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;

  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };

  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const [sourcesMounted, setSourcesMounted] = useState(false);
  const [evidenceMounted, setEvidenceMounted] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (sourcesExpanded) setSourcesMounted(true);
  }, [open, sourcesExpanded]);

  useEffect(() => {
    if (!open) return;
    if (evidenceExpanded) setEvidenceMounted(true);
  }, [open, evidenceExpanded]);

  useEffect(() => {
    if (!open) return;
    setSourcesExpanded(true);
    setSourcesMounted(true);
    if (controlledOpen) {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [open, controlledOpen]);

  if (!sources.length) return null;

  const uniqueDocs = new Set(sources.map((s) => s.file_name));
  const withSnippets = sources.filter((s) => s.snippet?.trim());
  const summary = `${sources.length} citation${sources.length === 1 ? "" : "s"} · ${uniqueDocs.size} doc${uniqueDocs.size === 1 ? "" : "s"}`;

  return (
    <section
      ref={rootRef}
      className={cn("mt-3", className)}
      aria-label="Sources and evidence"
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl border border-border/70",
            "bg-gradient-to-r from-muted/30 via-background to-muted/20 px-3 py-2.5",
            "text-left shadow-sm transition-all hover:border-primary/25 hover:shadow-md",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <BookOpen className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              Sources & evidence
            </span>
            <span className="block text-[11px] text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground" />
        </button>
      ) : (
        <div
          className={cn(
            "rounded-xl border border-border/80 bg-card/80 p-3 shadow-sm",
            "ring-1 ring-black/5 dark:ring-white/5",
          )}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                Sources & evidence
              </p>
              <p className="text-[11px] text-muted-foreground">{summary}</p>
            </div>
            {onOpenInPanel ? (
              <button
                type="button"
                onClick={onOpenInPanel}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                <FileSearch className="size-3.5" />
                Side panel
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSourcesExpanded(false);
                setEvidenceExpanded(false);
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              Hide
              <ChevronDown className="size-3.5 rotate-180" />
            </button>
          </div>

          <div className="space-y-2">
            <SectionToggle
              id={`${rootId}-sources`}
              title="Sources"
              icon={FileText}
              subtitle="Documents, pages, and citation markers"
              expanded={sourcesExpanded}
              onToggle={() => setSourcesExpanded((v) => !v)}
              lazyMounted={sourcesMounted}
            >
              <ol className="space-y-2">
                {sources.map((source, i) => {
                  const index = source.source_index ?? i + 1;
                  const location = formatSourceLocation(source);
                  return (
                    <li
                      key={`${source.document_id ?? source.file_name}-${i}`}
                      className="flex items-start gap-2 text-xs"
                    >
                      <Citation
                        index={index}
                        source={source}
                        active={activeIndex === index}
                        onSelect={onOpenSource}
                      />
                      <button
                        type="button"
                        disabled={!source.document_id || !onOpenSource}
                        onClick={() => onOpenSource?.(source, index)}
                        className={cn(
                          "min-w-0 flex-1 rounded-md border border-transparent px-2 py-1.5 text-left",
                          "transition-colors hover:border-border hover:bg-muted/40",
                          !source.document_id && "cursor-default opacity-60",
                        )}
                      >
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          <FileText className="size-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{source.file_name}</span>
                        </span>
                        <span className="mt-0.5 block pl-[18px] leading-relaxed text-muted-foreground">
                          {location}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </SectionToggle>

            <SectionToggle
              id={`${rootId}-evidence`}
              title="Evidence"
              icon={Quote}
              subtitle={
                withSnippets.length > 0
                  ? `${withSnippets.length} retrieved excerpt${withSnippets.length === 1 ? "" : "s"}`
                  : "No excerpts for this answer"
              }
              expanded={evidenceExpanded}
              onToggle={() => setEvidenceExpanded((v) => !v)}
              lazyMounted={evidenceMounted}
            >
              {withSnippets.length === 0 ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Open a source above to preview the document in the side panel.
                </p>
              ) : (
                <ul className="space-y-2">
                  {withSnippets.map((source, i) => {
                    const index = source.source_index ?? i + 1;
                    return (
                      <li
                        key={`ev-${source.document_id ?? source.file_name}-${i}`}
                        className="rounded-md border border-[var(--enterprise-accent)]/25 bg-[var(--enterprise-accent)]/5 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          <Citation
                            index={index}
                            source={source}
                            active={activeIndex === index}
                            onSelect={onOpenSource}
                          />
                          <span className="truncate normal-case text-foreground/90">
                            {source.file_name}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/90 line-clamp-4">
                          {source.snippet.trim()}
                        </p>
                        {source.document_id && onOpenSource ? (
                          <button
                            type="button"
                            className="mt-2 text-[11px] font-medium text-primary hover:underline"
                            onClick={() => onOpenSource(source, index)}
                          >
                            Open in document viewer
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionToggle>
          </div>
        </div>
      )}
    </section>
  );
}
