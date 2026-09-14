export type InfographicAccent =
  | "default"
  | "violet"
  | "emerald"
  | "amber"
  | "rose";

export type InfographicHighlightVariant =
  | "problem"
  | "insight"
  | "solution"
  | "neutral";

export type InfographicBlock =
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
  blocks: InfographicBlock[];
};
