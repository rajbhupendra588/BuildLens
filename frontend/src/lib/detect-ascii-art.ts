function lineBoxDensity(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  const matches = trimmed.match(/[|_=\-+#*┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬]/g);
  return (matches?.length ?? 0) / trimmed.length;
}

function isBoxyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const density = lineBoxDensity(line);
  const matches = trimmed.match(/[|_=\-+#*┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬]/g);
  return density > 0.35 || (matches !== null && matches.length >= 8);
}

/** Heuristic: dense box-drawing / pipe grids used as faux infographics. */
export function looksLikeAsciiArt(text: string): boolean {
  const lines = text.split("\n");
  if (lines.length < 4) return false;

  let boxLineCount = 0;
  let nonEmpty = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    nonEmpty++;
    if (isBoxyLine(line)) boxLineCount++;
  }

  return boxLineCount >= 3 && nonEmpty > 0 && boxLineCount / nonEmpty > 0.25;
}

/**
 * Wrap contiguous ASCII-art paragraphs in fenced blocks so the UI can collapse them.
 */
export function wrapAsciiArtBlocksInMarkdown(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    if (buffer.length === 0) return;
    const block = buffer.join("\n");
    if (looksLikeAsciiArt(block)) {
      out.push("```", block, "```");
    } else {
      out.push(block);
    }
    buffer = [];
  };

  for (const line of lines) {
    const fence = /^```/.test(line.trim());
    if (fence) {
      flush();
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (isBoxyLine(line)) {
      buffer.push(line);
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join("\n");
}
