import type { BlockReviseRequest } from "@/components/chat/block-revise";

export function buildBlockRevisePrompt(request: BlockReviseRequest): string {
  const instruction = request.instruction.trim();
  if (request.kind === "infographic") {
    const where =
      request.type === "header"
        ? `the title/header (“${request.title}”)`
        : `the “${request.title}” block (${request.type || "unknown"}, index ${
            typeof request.index === "number" ? request.index : "?"
          })`;
    return [
      `Revise only ${where} of the previous infographic or visual dashboard.`,
      "Keep the same ```infographic JSON document, same kind/accent, and every other block unchanged unless a tiny consistency fix is required.",
      "Do not invent numbers; ground changes in the attached sources.",
      "",
      `Revision request: ${instruction}`,
      "",
      "Return the full updated ```infographic JSON.",
    ].join("\n");
  }

  return [
    `Revise only the section titled “${request.title}” in your previous reply.`,
    "Keep every other section unchanged.",
    `Revision request: ${instruction}`,
  ].join("\n");
}
