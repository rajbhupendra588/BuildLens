"use client";

import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

let mermaidInitialized = false;

function ensureMermaidInit() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    securityLevel: "strict",
    fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
  });
  mermaidInitialized = true;
}

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureMermaidInit();
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const renderId = `mermaid-${reactId}-${Math.random().toString(36).slice(2, 9)}`;

    mermaid
      .render(renderId, chart.trim())
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        bindFunctions?.(containerRef.current);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not render diagram");
      });

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  if (error) {
    return (
      <div className="my-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        Diagram could not be rendered. Ask the assistant to simplify the Mermaid chart.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-4 w-full overflow-x-auto rounded-xl border border-border bg-muted/20 p-4 [&_svg]:mx-auto [&_svg]:max-w-full"
      aria-label="Diagram"
    />
  );
}
