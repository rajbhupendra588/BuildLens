/** True if text looks like a bibliography / sources footer (not body prose). */
function looksLikeSourcesFooter(text: string): boolean {
  const citations = text.match(/\[\d+\]/g)?.length ?? 0;
  if (citations < 1) return false;
  return /Sources?/i.test(text.slice(0, 120));
}

/**
 * Removes trailing LLM "Sources" blocks when structured citations render in the UI.
 */
export function stripTrailingSourcesSection(content: string): string {
  let result = content.trimEnd();
  if (!result) return content;

  const patterns: RegExp[] = [
    /\n---+\s*\n[\s\S]*?(?:\*\*)?Sources?(?:\*\*)?\s*:?[\s\S]*$/i,
    /\n#{1,6}\s*Sources?\s*:?\s*[\s\S]*$/i,
    /\n\*\*Sources?\*\*\s*:?\s*[\s\S]*$/i,
    /\nSources?\s*:\s*\n[\s\S]*$/i,
    /\nSources?\s*:\s*[\s\S]*$/i,
    /\n(?:[-*]\s*)+\[\d+\][\s\S]*$/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, "").trimEnd();
    }
  }

  // "Sources: [1] …; [2] …" as final paragraph (common in briefing output)
  const paragraphSources = result.match(
    /(?:^|\n\n)\s*(?:\*\*)?Sources?(?:\*\*)?\s*:\s*[\s\S]+$/i,
  );
  if (paragraphSources?.index !== undefined) {
    const start = paragraphSources.index;
    const tail = result.slice(start);
    if (looksLikeSourcesFooter(tail)) {
      result = result.slice(0, start).trimEnd();
    }
  }

  // Last block: heading or label "Sources" with mostly citation lines
  const lastBreak = result.lastIndexOf("\n\n");
  if (lastBreak !== -1) {
    const tail = result.slice(lastBreak);
    if (looksLikeSourcesFooter(tail) && tail.length < result.length * 0.65) {
      result = result.slice(0, lastBreak).trimEnd();
    }
  }

  return result;
}
