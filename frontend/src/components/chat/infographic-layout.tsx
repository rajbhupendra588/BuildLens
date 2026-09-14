"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type {
  InfographicAccent,
  InfographicBlock,
  InfographicDocument,
  InfographicHighlightVariant,
} from "@/types/infographic";
import { parseInfographicJson } from "@/lib/parse-infographic";
import { MermaidDiagram } from "./mermaid-diagram";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Copy,
  Check,
  Cpu,
  Database,
  Layers,
  Lightbulb,
  Network,
  Settings,
  Shield,
  Sparkles,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  brain: Brain,
  cpu: Cpu,
  network: Network,
  shield: Shield,
  target: Target,
  layers: Layers,
  zap: Zap,
  book: BookOpen,
  cog: Settings,
  settings: Settings,
  database: Database,
  sparkles: Sparkles,
};

const ACCENT_HEADER: Record<
  InfographicAccent,
  { gradient: string; ring: string }
> = {
  default: {
    gradient:
      "from-primary via-primary to-primary/80 dark:from-primary dark:via-primary/90 dark:to-primary/70",
    ring: "ring-primary/20",
  },
  violet: {
    gradient:
      "from-violet-600 via-violet-600 to-indigo-600 dark:from-violet-500 dark:via-violet-600 dark:to-indigo-500",
    ring: "ring-violet-500/25",
  },
  emerald: {
    gradient:
      "from-emerald-600 via-teal-600 to-emerald-700 dark:from-emerald-500 dark:via-teal-600 dark:to-emerald-600",
    ring: "ring-emerald-500/25",
  },
  amber: {
    gradient:
      "from-amber-500 via-orange-500 to-amber-600 dark:from-amber-500 dark:via-orange-600 dark:to-amber-600",
    ring: "ring-amber-500/25",
  },
  rose: {
    gradient:
      "from-rose-500 via-pink-600 to-rose-600 dark:from-rose-500 dark:via-pink-600 dark:to-rose-600",
    ring: "ring-rose-500/25",
  },
};

const HIGHLIGHT_STYLES: Record<
  InfographicHighlightVariant,
  { border: string; bg: string; icon: LucideIcon; iconClass: string }
> = {
  problem: {
    border: "border-amber-200 dark:border-amber-800",
    bg: "bg-amber-50/90 dark:bg-amber-950/35",
    icon: AlertTriangle,
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  insight: {
    border: "border-sky-200 dark:border-sky-800",
    bg: "bg-sky-50/90 dark:bg-sky-950/35",
    icon: Lightbulb,
    iconClass: "text-sky-600 dark:text-sky-400",
  },
  solution: {
    border: "border-emerald-200 dark:border-emerald-800",
    bg: "bg-emerald-50/90 dark:bg-emerald-950/35",
    icon: CheckCircle2,
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  neutral: {
    border: "border-border",
    bg: "bg-muted/50",
    icon: Sparkles,
    iconClass: "text-primary",
  },
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

function BlockRenderer({ block }: { block: InfographicBlock }) {
  switch (block.type) {
    case "highlight": {
      const style = HIGHLIGHT_STYLES[block.variant];
      const Icon = style.icon;
      return (
        <div
          className={cn(
            "rounded-xl border p-4 shadow-sm",
            style.border,
            style.bg,
          )}
        >
          <div className="flex gap-3">
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/70 shadow-sm",
                style.iconClass,
              )}
            >
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-foreground">
                {block.title}
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {block.text}
              </p>
            </div>
          </div>
        </div>
      );
    }
    case "metrics":
      return (
        <div className="space-y-3">
          {block.title ? <SectionLabel>{block.title}</SectionLabel> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {block.items.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/80 bg-card px-4 py-3 shadow-sm"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                  {item.value}
                </p>
                {item.hint ? (
                  <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      );
    case "formula":
      return (
        <div className="rounded-xl border border-border/80 bg-gradient-to-b from-muted/40 to-card px-4 py-4 shadow-sm">
          {block.title ? (
            <SectionLabel>{block.title}</SectionLabel>
          ) : null}
          <div
            className={cn(
              "mt-2 rounded-lg border border-border/60 bg-background/80 px-4 py-3 text-center",
              block.title ? "mt-3" : "mt-0",
            )}
          >
            <code className="font-mono text-sm font-medium text-foreground sm:text-base">
              {block.expression}
            </code>
          </div>
          {block.caption ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {block.caption}
            </p>
          ) : null}
        </div>
      );
    case "pillars":
      return (
        <div className="space-y-3">
          {block.title ? <SectionLabel>{block.title}</SectionLabel> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {block.items.map((item, i) => {
              const Icon = ICONS[item.icon?.toLowerCase() ?? ""] ?? Sparkles;
              return (
                <div
                  key={i}
                  className="group rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-accent/30"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <h4 className="text-sm font-semibold leading-snug text-foreground">
                      {item.title}
                    </h4>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      );
    case "flow":
      return (
        <div className="space-y-3">
          {block.title ? <SectionLabel>{block.title}</SectionLabel> : null}
          <MermaidDiagram chart={block.mermaid} />
        </div>
      );
    case "compare":
      return (
        <div className="space-y-3">
          {block.title ? <SectionLabel>{block.title}</SectionLabel> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {[block.left, block.right].map((side, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"
              >
                <h4 className="text-sm font-semibold text-foreground">
                  {side.heading}
                </h4>
                <ul className="mt-3 space-y-2">
                  {side.points.map((point, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                    >
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      );
    case "takeaways":
      return (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 dark:bg-primary/[0.08]">
          <SectionLabel>{block.title ?? "Key takeaways"}</SectionLabel>
          <ul className="mt-3 space-y-2.5">
            {block.items.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

function InfographicCanvas({ data }: { data: InfographicDocument }) {
  const accent = data.accent ?? "default";
  const header = ACCENT_HEADER[accent];

  return (
    <article
      className={cn(
        "not-prose -mx-1 my-5 overflow-hidden rounded-2xl border border-border/80 bg-card text-base shadow-md ring-1",
        header.ring,
      )}
    >
      <header
        className={cn(
          "relative bg-gradient-to-br px-5 py-6 text-primary-foreground sm:px-6 sm:py-7",
          header.gradient,
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.22),transparent_45%)]" />
        <div className="relative space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/80">
            Infographic
          </p>
          <h3 className="text-xl font-bold leading-tight sm:text-2xl">
            {data.title}
          </h3>
          {data.subtitle ? (
            <p className="max-w-2xl text-sm leading-relaxed text-primary-foreground/90 sm:text-[15px]">
              {data.subtitle}
            </p>
          ) : null}
          {data.meta && data.meta.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {data.meta.map((tag, i) => (
                <span
                  key={i}
                  className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="space-y-5 px-4 py-5 sm:px-5 sm:py-6">
        {data.blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} />
        ))}
      </div>
    </article>
  );
}

function InfographicParseError({
  error,
  raw,
  incomplete,
}: {
  error: string;
  raw: string;
  incomplete?: boolean;
}) {
  if (incomplete) {
    return (
      <div className="my-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Rendering infographic…
      </div>
    );
  }

  return (
    <div className="my-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <p className="font-medium text-amber-900 dark:text-amber-100">
        Could not render infographic
      </p>
      <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
        {error}
      </p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Show raw JSON</summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-[10px]">
          {raw}
        </pre>
      </details>
    </div>
  );
}

export function InfographicBlock({ rawJson }: { rawJson: string }) {
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => parseInfographicJson(rawJson), [rawJson]);

  const handleCopy = useCallback(async () => {
    if (!result.ok) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [result]);

  if (!result.ok) {
    return (
      <InfographicParseError
        error={result.error}
        raw={rawJson}
        incomplete={result.incomplete}
      />
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
      >
        {copied ? (
          <>
            <Check className="size-3" /> Copied
          </>
        ) : (
          <>
            <Copy className="size-3" /> Copy JSON
          </>
        )}
      </button>
      <InfographicCanvas data={result.data} />
    </div>
  );
}
