"use client";

import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: "neutral" as const,
  securityLevel: "strict" as const,
  suppressErrorRendering: true,
  fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
};

function removeMermaidErrorArtifacts(renderId: string) {
  const ids = [renderId, `d${renderId}`];
  for (const id of ids) {
    document.getElementById(id)?.remove();
  }
  document.querySelectorAll("body > svg").forEach((svg) => {
    const text = svg.textContent ?? "";
    if (text.includes("Syntax error in text") && text.includes("mermaid")) {
      svg.remove();
    }
  });
}

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize(MERMAID_CONFIG);
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const renderId = `mermaid-${reactId}-${Math.random().toString(36).slice(2, 9)}`;
    const source = chart.trim();
    if (!source) {
      setError("empty");
      return;
    }

    mermaid
      .render(renderId, source)
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        bindFunctions?.(containerRef.current);
        setError(null);
      })
      .catch((err: unknown) => {
        removeMermaidErrorArtifacts(renderId);
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not render diagram");
      });

    return () => {
      cancelled = true;
      removeMermaidErrorArtifacts(renderId);
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
