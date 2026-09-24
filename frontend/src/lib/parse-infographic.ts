import type {
  InfographicAccent,
  InfographicBlock,
  InfographicChartKind,
  InfographicChartPoint,
  InfographicChartSeries,
  InfographicDocument,
  InfographicHighlightVariant,
  InfographicKind,
} from "@/types/infographic";

const KINDS = new Set<InfographicKind>(["infographic", "dashboard"]);

const CHART_KINDS = new Set<InfographicChartKind>([
  "pie",
  "donut",
  "bar",
  "hbar",
  "line",
]);

const ACCENTS = new Set<InfographicAccent>([
  "default",
  "violet",
  "emerald",
  "amber",
  "rose",
]);

const HIGHLIGHT_VARIANTS = new Set<InfographicHighlightVariant>([
  "problem",
  "insight",
  "solution",
  "neutral",
]);

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => asString(v))
    .filter(Boolean)
    .slice(0, 12);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[%$,\s]/g, "").replace(/[()]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseChartPoints(raw: unknown): InfographicChartPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label =
        asString(row.label) || asString(row.name) || asString(row.category);
      const value = asNumber(row.value ?? row.y ?? row.count);
      if (!label || value === null) return null;
      return { label, value };
    })
    .filter(Boolean) as InfographicChartPoint[];
}

function parseChartSeries(block: Record<string, unknown>): InfographicChartSeries[] {
  if (Array.isArray(block.series) && block.series.length > 0) {
    return block.series
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const points = parseChartPoints(
          row.points || row.data || row.items || row.values,
        );
        if (points.length === 0) return null;
        return {
          name: asString(row.name) || asString(row.label) || `Series ${index + 1}`,
          points: points.slice(0, 12),
        };
      })
      .filter(Boolean) as InfographicChartSeries[];
  }
  const points = parseChartPoints(block.points || block.data || block.items);
  if (points.length === 0) return [];
  return [{ name: asString(block.seriesName) || "Value", points: points.slice(0, 12) }];
}

function mermaidSafeId(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "_") || fallback;
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `n_${cleaned}`;
}

function mermaidSafeLabel(raw: string): string {
  return raw
    .replace(/[\[\]|#{}"]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/[—–−]/g, "-")
    .replace(/&/g, "and")
    .replace(/</g, "lt")
    .replace(/>/g, "gt")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72) || "step";
}

function mermaidFromSteps(
  stepsRaw: unknown,
  edgesRaw: unknown,
): string | null {
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) return null;
  const steps = stepsRaw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = mermaidSafeId(
        asString(row.id) || asString(row.key) || `step${index + 1}`,
        `step${index + 1}`,
      );
      const label = mermaidSafeLabel(
        asString(row.label) || asString(row.title) || asString(row.name) || id,
      );
      return { id, label };
    })
    .filter(Boolean) as { id: string; label: string }[];
  if (steps.length === 0) return null;

  const lines = ["flowchart LR"];
  for (const step of steps) {
    lines.push(`  ${step.id}["${step.label}"]`);
  }

  const edges = Array.isArray(edgesRaw)
    ? edgesRaw
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const from = mermaidSafeId(asString(row.from) || asString(row.source), "");
          const to = mermaidSafeId(asString(row.to) || asString(row.target), "");
          if (!from || !to) return null;
          return { from, to };
        })
        .filter(Boolean)
    : [];

  if (edges.length > 0) {
    for (const edge of edges as { from: string; to: string }[]) {
      lines.push(`  ${edge.from} --> ${edge.to}`);
    }
  } else {
    for (let i = 0; i < steps.length - 1; i++) {
      lines.push(`  ${steps[i].id} --> ${steps[i + 1].id}`);
    }
  }

  return lines.join("\n");
}

function mermaidFromBlock(block: Record<string, unknown>): string {
  const fromSteps = mermaidFromSteps(block.steps, block.edges);
  const fromLines = Array.isArray(block.mermaidLines)
    ? block.mermaidLines.map((line) => asString(line)).filter(Boolean).join("\n")
    : "";
  return fromSteps || fromLines || asString(block.mermaid) || "";
}

function parseBlock(raw: unknown): InfographicBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const block = raw as Record<string, unknown>;
  const type = asString(block.type);

  switch (type) {
    case "story":
    case "narrative":
    case "overview": {
      const paragraphs = asStringArray(
        block.paragraphs || block.body || block.text || block.items,
      );
      if (paragraphs.length === 0) return null;
      return {
        type: "story",
        title: asString(block.title) || undefined,
        paragraphs: paragraphs.slice(0, 6),
      };
    }
    case "highlight": {
      const variant = asString(block.variant, "neutral") as InfographicHighlightVariant;
      const title = asString(block.title);
      const text = asString(block.text) || asString(block.body);
      if (!title || !text) return null;
      return {
        type: "highlight",
        variant: HIGHLIGHT_VARIANTS.has(variant) ? variant : "neutral",
        title,
        text,
      };
    }
    case "metrics": {
      const itemsRaw = Array.isArray(block.items) ? block.items : [];
      const items = itemsRaw
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const label = asString(row.label) || asString(row.concept);
          const value = asString(row.value) || asString(row.takeaway) || asString(row.hint);
          if (!label || !value) return null;
          const hint = asString(row.hint);
          const useHint = hint && hint !== value ? hint : asString(row.detail);
          return useHint ? { label, value, hint: useHint } : { label, value };
        })
        .filter(Boolean) as { label: string; value: string; hint?: string }[];
      if (items.length === 0) return null;
      return {
        type: "metrics",
        title: asString(block.title) || undefined,
        items: items.slice(0, 8),
      };
    }
    case "chart":
    case "pie":
    case "donut":
    case "bar":
    case "hbar":
    case "line": {
      const chartRaw = asString(block.chart) || asString(block.chartType) || type;
      const chart = (
        CHART_KINDS.has(chartRaw as InfographicChartKind) ? chartRaw : "bar"
      ) as InfographicChartKind;
      const title =
        asString(block.title) || asString(block.name) || "Chart";
      const series = parseChartSeries(block);
      if (!title || series.length === 0) return null;
      return {
        type: "chart",
        chart,
        title,
        subtitle: asString(block.subtitle) || undefined,
        unit: asString(block.unit) || undefined,
        source: asString(block.source) || undefined,
        series: series.slice(0, 4),
      };
    }
    case "table": {
      const columns = asStringArray(block.columns || block.headers);
      const rowsRaw = Array.isArray(block.rows) ? block.rows : [];
      const rows = rowsRaw
        .map((row) => {
          if (Array.isArray(row)) {
            return row.map((cell) => asString(cell)).slice(0, 8);
          }
          if (row && typeof row === "object") {
            return columns.map((col) =>
              asString((row as Record<string, unknown>)[col]),
            );
          }
          return null;
        })
        .filter((row): row is string[] => Boolean(row && row.some(Boolean)))
        .slice(0, 10);
      if (columns.length === 0 || rows.length === 0) return null;
      return {
        type: "table",
        title: asString(block.title) || undefined,
        caption: asString(block.caption) || undefined,
        columns: columns.slice(0, 8),
        rows,
      };
    }
    case "timeline": {
      const itemsRaw = Array.isArray(block.items) ? block.items : [];
      const items = itemsRaw
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const when =
            asString(row.when) ||
            asString(row.date) ||
            asString(row.year) ||
            asString(row.period);
          const title = asString(row.title) || asString(row.label);
          if (!when || !title) return null;
          const text = asString(row.text) || asString(row.description);
          return text ? { when, title, text } : { when, title };
        })
        .filter(Boolean) as { when: string; title: string; text?: string }[];
      if (items.length === 0) return null;
      return {
        type: "timeline",
        title: asString(block.title) || undefined,
        items: items.slice(0, 10),
      };
    }
    case "formula": {
      const expression = asString(block.expression) || asString(block.formula);
      if (!expression) return null;
      return {
        type: "formula",
        title: asString(block.title) || undefined,
        expression,
        caption: asString(block.caption) || undefined,
      };
    }
    case "pillars": {
      const itemsRaw = Array.isArray(block.items) ? block.items : [];
      const items = itemsRaw
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const title = asString(row.title);
          const description = asString(row.description) || asString(row.text);
          if (!title || !description) return null;
          const icon = asString(row.icon) || undefined;
          return icon ? { title, description, icon } : { title, description };
        })
        .filter(Boolean) as {
        title: string;
        description: string;
        icon?: string;
      }[];
      if (items.length === 0) return null;
      return {
        type: "pillars",
        title: asString(block.title) || undefined,
        items: items.slice(0, 9),
      };
    }
    case "flow": {
      const parsedSteps = Array.isArray(block.steps)
        ? (block.steps
            .map((item, index) => {
              if (!item || typeof item !== "object") return null;
              const row = item as Record<string, unknown>;
              const id = mermaidSafeId(
                asString(row.id) || asString(row.key) || `step${index + 1}`,
                `step${index + 1}`,
              );
              const label =
                asString(row.label) ||
                asString(row.title) ||
                asString(row.name) ||
                id;
              if (!label) return null;
              return { id, label };
            })
            .filter(Boolean) as { id: string; label: string }[])
        : [];
      const mermaid = mermaidFromBlock(block);
      if (!mermaid && parsedSteps.length === 0) return null;
      return {
        type: "flow",
        title: asString(block.title) || undefined,
        mermaid,
        steps: parsedSteps.length ? parsedSteps : undefined,
      };
    }
    case "compare": {
      const parseSide = (side: unknown) => {
        if (!side || typeof side !== "object") return null;
        const s = side as Record<string, unknown>;
        const heading = asString(s.heading) || asString(s.title);
        const points = asStringArray(s.points || s.items);
        if (!heading || points.length === 0) return null;
        return { heading, points: points.slice(0, 6) };
      };
      const left = parseSide(block.left);
      const right = parseSide(block.right);
      if (!left || !right) return null;
      return {
        type: "compare",
        title: asString(block.title) || undefined,
        left,
        right,
      };
    }
    case "takeaways": {
      const items = asStringArray(block.items || block.points);
      if (items.length === 0) return null;
      return {
        type: "takeaways",
        title: asString(block.title) || undefined,
        items: items.slice(0, 10),
      };
    }
    default:
      return null;
  }
}

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:jsonc?|infographic)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw;
}

function replaceSmartQuotes(raw: string): string {
  return raw
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function peekNonWs(raw: string, from: number): { index: number; char: string } {
  let i = from;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  return { index: i, char: i < raw.length ? raw[i] : "" };
}

/**
 * True when a quote inside a JSON string is the real terminator, not a label
 * like mermaid `A["Start"]`. `]` is a terminator only when it closes an array.
 */
function isStructuralStringCloser(raw: string, quoteIndex: number): boolean {
  const next = peekNonWs(raw, quoteIndex + 1);
  if (!next.char) return true;
  if (",}:".includes(next.char)) return true;
  if (next.char !== "]") return false;
  const after = peekNonWs(raw, next.index + 1);
  return !after.char || ",}]:".includes(after.char);
}

/** String-aware cleanup for common LLM JSON mistakes. */
function repairLooseJson(raw: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        if (isStructuralStringCloser(raw, i)) {
          out += ch;
          inString = false;
        } else {
          out += '\\"';
        }
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        out += "\\n";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
      if (ch.charCodeAt(0) < 32) continue;
      out += ch;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "/" && raw[i + 1] === "/") {
      while (i < raw.length && raw[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && raw[i + 1] === "*") {
      i += 2;
      while (i < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i += 1;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < raw.length && /\s/.test(raw[j])) j++;
      if (raw[j] === "}" || raw[j] === "]") continue;
    }

    out += ch;
  }

  return out;
}

function tryParseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Close strings/brackets when a stream or reply is cut off mid-JSON. */
function closeTruncatedJson(raw: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.length) stack.pop();
    }
  }

  let out = raw.trimEnd();
  if (inString) out += '"';
  out = out.replace(/,\s*$/, "");
  while (stack.length) out += stack.pop();
  return out;
}

function parseJsonLenient(raw: string): unknown | undefined {
  const stripped = extractJsonObject(replaceSmartQuotes(stripFence(raw)));
  const repaired = repairLooseJson(stripped);
  return (
    tryParseJson(stripped) ??
    tryParseJson(repaired) ??
    tryParseJson(closeTruncatedJson(repaired)) ??
    tryParseJson(
      closeTruncatedJson(repairLooseJson(replaceSmartQuotes(stripFence(raw)))),
    )
  );
}

export type ParseInfographicResult =
  | { ok: true; data: InfographicDocument }
  | { ok: false; error: string; incomplete?: boolean };

export function parseInfographicJson(raw: string): ParseInfographicResult {
  const stripped = stripFence(raw);
  const objectStart = stripped.indexOf("{");
  const objectEnd = stripped.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd < objectStart) {
    return {
      ok: false,
      error: "Infographic JSON is incomplete.",
      incomplete: true,
    };
  }

  const parsed = parseJsonLenient(raw);
  if (parsed === undefined) {
    return { ok: false, error: "Invalid JSON in infographic block." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Infographic root must be a JSON object." };
  }

  const doc = parsed as Record<string, unknown>;
  const title = asString(doc.title);
  if (!title) {
    return { ok: false, error: 'Infographic requires a "title" field.' };
  }

  const blocksRaw = Array.isArray(doc.blocks) ? doc.blocks : [];
  const blocks = blocksRaw
    .map(parseBlock)
    .filter(Boolean) as InfographicBlock[];

  if (blocks.length === 0) {
    return { ok: false, error: "Infographic needs at least one valid block." };
  }

  const accentRaw = asString(doc.accent, "default") as InfographicAccent;
  const accent = ACCENTS.has(accentRaw) ? accentRaw : "default";
  const kindRaw = asString(doc.kind, "infographic") as InfographicKind;
  const kind = KINDS.has(kindRaw) ? kindRaw : "infographic";

  return {
    ok: true,
    data: {
      title,
      subtitle: asString(doc.subtitle) || undefined,
      meta: asStringArray(doc.meta).length ? asStringArray(doc.meta) : undefined,
      accent,
      kind,
      blocks: blocks.slice(0, 18),
    },
  };
}

function looksLikeInfographicPayload(raw: string): boolean {
  const head = stripFence(raw).slice(0, 1600);
  return (
    /"kind"\s*:\s*"(infographic|dashboard)"/i.test(head) ||
    (/"title"\s*:/.test(head) && /"blocks"\s*:/.test(head))
  );
}

export function looksLikeInfographicJson(raw: string): boolean {
  if (parseInfographicJson(raw).ok) return true;
  return looksLikeInfographicPayload(raw);
}
