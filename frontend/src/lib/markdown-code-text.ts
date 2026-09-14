/**
 * Flatten react-markdown `code` children into source text.
 *
 * `String(children)` turns `["{...}", "\n"]` into `"{...},\n"` because Array#toString
 * joins with commas — that silently invalidates JSON and Mermaid fences.
 */
export function markdownCodeText(children: unknown): string {
  return flattenMarkdownChildren(children).replace(/\n$/, "");
}

function flattenMarkdownChildren(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenMarkdownChildren).join("");
  if (typeof node === "object" && node !== null && "props" in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return flattenMarkdownChildren(props?.children);
  }
  return "";
}
