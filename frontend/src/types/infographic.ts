export type InfographicAccent =
  | "default"
  | "violet"
  | "emerald"
  | "amber"
  | "rose";

export type InfographicKind = "infographic" | "dashboard";

export type InfographicHighlightVariant =
  | "problem"
  | "insight"
  | "solution"
  | "neutral";

export type InfographicChartKind =
  | "pie"
  | "donut"
  | "bar"
  | "hbar"
  | "line";

export type InfographicChartPoint = {
  label: string;
  value: number;
};

export type InfographicChartSeries = {
  name: string;
  points: InfographicChartPoint[];
};

export type InfographicBlock =
  | {
      type: "story";
      title?: string;
      paragraphs: string[];
    }
  | {
      type: "highlight";
      variant: InfographicHighlightVariant;
      title: string;
      text: string;
    }
  | {
      type: "metrics";
      title?: string;
      items: { label: string; value: string; hint?: string }[];
    }
  | {
      type: "chart";
      chart: InfographicChartKind;
      title: string;
      subtitle?: string;
      unit?: string;
      source?: string;
      series: InfographicChartSeries[];
    }
  | {
      type: "table";
      title?: string;
      caption?: string;
      columns: string[];
      rows: string[][];
    }
  | {
      type: "timeline";
      title?: string;
      items: { when: string; title: string; text?: string }[];
    }
  | {
      type: "formula";
      title?: string;
      expression: string;
      caption?: string;
    }
  | {
      type: "pillars";
      title?: string;
      items: { title: string; description: string; icon?: string }[];
    }
  | {
      type: "flow";
      title?: string;
      mermaid: string;
      steps?: { id: string; label: string }[];
    }
  | {
      type: "compare";
      title?: string;
      left: { heading: string; points: string[] };
      right: { heading: string; points: string[] };
    }
  | {
      type: "takeaways";
      title?: string;
      items: string[];
    };

export type InfographicDocument = {
  title: string;
  subtitle?: string;
  meta?: string[];
  accent?: InfographicAccent;
  kind?: InfographicKind;
  blocks: InfographicBlock[];
};
