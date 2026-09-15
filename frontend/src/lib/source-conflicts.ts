import type { SourceItem } from "@/types/chat";

export interface SourceConflict {
  label: string;
  entries: { documentName: string; pageLabel: string; excerpt: string }[];
}

/** Heuristic: flag when multiple sources cite different concrete grades (M##). */
export function detectConcreteGradeConflicts(
  sources: SourceItem[],
): SourceConflict | null {
  const gradeRe = /\bM\s*(\d{2,3})\b/gi;
  const byGrade = new Map<
    string,
    { documentName: string; pageLabel: string; excerpt: string }
  >();

  for (const src of sources) {
    const text = `${src.snippet ?? ""}`;
    let match: RegExpExecArray | null;
    gradeRe.lastIndex = 0;
    while ((match = gradeRe.exec(text)) !== null) {
      const grade = `M${match[1]}`;
      if (!byGrade.has(grade)) {
        byGrade.set(grade, {
          documentName: src.file_name,
          pageLabel: src.page_number
            ? `Page ${src.page_number}`
            : src.section_title ?? "Section",
          excerpt: text.slice(0, 120),
        });
      }
    }
  }

  if (byGrade.size < 2) return null;

  return {
    label: "Concrete grade specifications differ across sources",
    entries: [...byGrade.entries()].map(([grade, entry]) => ({
      documentName: `${entry.documentName} (${grade})`,
      pageLabel: entry.pageLabel,
      excerpt: entry.excerpt,
    })),
  };
}
