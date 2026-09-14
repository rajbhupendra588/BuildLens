import type {
  InfographicAccent,
  InfographicBlock,
  InfographicDocument,
  InfographicHighlightVariant,
} from "@/types/infographic";

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
    .slice(0, 8);
}

function mermaidSafeId(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "_") || fallback;
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `n_${cleaned}`;
}

function mermaidSafeLabel(raw: string): string {
  return raw.replace(/[\[\]|#{}"]/g, " ").replace(/\s+/g, " ").trim() || "step";
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
    lines.push(`  ${step.id}[${step.label}]`);
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
  const fromLines = Array.isArray(block.mermaidLines)
    ? block.mermaidLines.map((line) => asString(line)).filter(Boolean).join("\n")
    : "";
  const fromSteps = mermaidFromSteps(block.steps, block.edges);
  return asString(block.mermaid) || fromLines || fromSteps || "";
}

function parseBlock(raw: unknown): InfographicBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const block = raw as Record<string, unknown>;
  const type = asString(block.type);

  switch (type) {
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
        items: items.slice(0, 6),
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
      const mermaid = mermaidFromBlock(block);
      if (!mermaid) return null;
      return {
        type: "flow",
        title: asString(block.title) || undefined,
        mermaid,
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
        items: items.slice(0, 8),
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

function parseJsonLenient(raw: string): unknown | undefined {
  const stripped = extractJsonObject(replaceSmartQuotes(stripFence(raw)));
  return (
    tryParseJson(stripped) ??
    tryParseJson(repairLooseJson(stripped)) ??
    tryParseJson(repairLooseJson(replaceSmartQuotes(stripFence(raw))))
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

  return {
    ok: true,
    data: {
      title,
      subtitle: asString(doc.subtitle) || undefined,
      meta: asStringArray(doc.meta).length ? asStringArray(doc.meta) : undefined,
      accent,
      blocks: blocks.slice(0, 12),
    },
  };
}

export function looksLikeInfographicJson(raw: string): boolean {
  return parseInfographicJson(raw).ok;
}
