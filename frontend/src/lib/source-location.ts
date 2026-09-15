import type { SourceItem } from "@/types/chat";

/** Display page, paragraph, and line range for a source excerpt. */
export function formatSourceLocation(source: SourceItem): string {
  if (source.location_label?.trim()) {
    return source.location_label.trim();
  }

  const parts: string[] = [];

  if (source.page_number != null && source.page_number > 0) {
    parts.push(`Page ${source.page_number}`);
  }

  if (source.paragraph_index != null && source.paragraph_index > 0) {
    parts.push(`Paragraph ${source.paragraph_index}`);
  }

  if (source.line_start != null && source.line_start > 0) {
    if (
      source.line_end != null &&
      source.line_end > source.line_start
    ) {
      parts.push(`Lines ${source.line_start}–${source.line_end}`);
    } else {
      parts.push(`Line ${source.line_start}`);
    }
  }

  if (parts.length === 0 && source.section_title) {
    parts.push(source.section_title);
  }

  return parts.length > 0 ? parts.join(" · ") : "Document excerpt";
}

export function formatSourceCitationLine(source: SourceItem, index: number): string {
  const loc = formatSourceLocation(source);
  return `[${index}] ${source.file_name} — ${loc}`;
}
