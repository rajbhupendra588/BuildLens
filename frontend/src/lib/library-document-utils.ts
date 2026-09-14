import { LibraryDocument } from "@/types/document";

export type LibrarySortKey =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "kind-asc"
  | "kind-desc"
  | "size-desc"
  | "size-asc"
  | "chunks-desc"
  | "chunks-asc";

export const LIBRARY_KIND_FILTERS = [
  "all",
  "PDF",
  "Image",
  "Document",
  "Spreadsheet",
  "Text",
  "Code",
  "JSON",
  "File",
] as const;

export type LibraryKindFilter = (typeof LIBRARY_KIND_FILTERS)[number];

export const LIBRARY_SORT_OPTIONS: {
  value: LibrarySortKey;
  label: string;
}[] = [
  { value: "date-desc", label: "Date added (newest)" },
  { value: "date-asc", label: "Date added (oldest)" },
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "kind-asc", label: "Kind (A–Z)" },
  { value: "kind-desc", label: "Kind (Z–A)" },
  { value: "size-desc", label: "Size (largest)" },
  { value: "size-asc", label: "Size (smallest)" },
  { value: "chunks-desc", label: "Chunks (most)" },
  { value: "chunks-asc", label: "Chunks (fewest)" },
];

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const SPREADSHEET_EXT = new Set(["csv", "xlsx"]);
const CODE_EXT = new Set([
  "py",
  "js",
  "jsx",
  "ts",
  "tsx",
  "java",
  "go",
  "rs",
  "c",
  "cpp",
  "rb",
  "php",
  "swift",
  "sh",
  "sql",
]);

export function fileExtension(name: string): string {
  const parts = name.split(".");
  if (parts.length < 2) return "";
  return parts.pop()!.toLowerCase();
}

/** Human-friendly kind for sorting and display (PDF, Image, Spreadsheet, …). */
export function libraryFileKind(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "Container";
  const ext = fileExtension(name);
  if (ext === "pdf") return "PDF";
  if (IMAGE_EXT.has(ext)) return "Image";
  if (ext === "docx" || ext === "pptx") return "Document";
  if (SPREADSHEET_EXT.has(ext)) return "Spreadsheet";
  if (ext === "json") return "JSON";
  if (ext === "md" || ext === "txt" || ext === "puml") return "Text";
  if (CODE_EXT.has(ext)) return "Code";
  if (ext) return ext.toUpperCase();
  return "File";
}

export function formatLibraryDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareDates(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return ta - tb;
}

export function sortLibraryDocuments(
  docs: LibraryDocument[],
  sortKey: LibrarySortKey,
): LibraryDocument[] {
  const sorted = [...docs];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "date-desc":
        cmp = -compareDates(a.uploaded_at, b.uploaded_at);
        break;
      case "date-asc":
        cmp = compareDates(a.uploaded_at, b.uploaded_at);
        break;
      case "name-asc":
        cmp = compareStrings(a.file_name, b.file_name);
        break;
      case "name-desc":
        cmp = compareStrings(b.file_name, a.file_name);
        break;
      case "kind-asc":
        cmp = compareStrings(
          libraryFileKind(a.file_name),
          libraryFileKind(b.file_name),
        );
        if (cmp === 0) cmp = compareStrings(a.file_name, b.file_name);
        break;
      case "kind-desc":
        cmp = compareStrings(
          libraryFileKind(b.file_name),
          libraryFileKind(a.file_name),
        );
        if (cmp === 0) cmp = compareStrings(b.file_name, a.file_name);
        break;
      case "size-desc":
        cmp = (b.file_size ?? 0) - (a.file_size ?? 0);
        break;
      case "size-asc":
        cmp = (a.file_size ?? 0) - (b.file_size ?? 0);
        break;
      case "chunks-desc":
        cmp = (b.chunk_count ?? 0) - (a.chunk_count ?? 0);
        break;
      case "chunks-asc":
        cmp = (a.chunk_count ?? 0) - (b.chunk_count ?? 0);
        break;
      default:
        cmp = 0;
    }
    return cmp;
  });
  return sorted;
}

export function filterLibraryDocuments(
  docs: LibraryDocument[],
  query: string,
  kindFilter: LibraryKindFilter = "all",
): LibraryDocument[] {
  let result = docs;
  if (kindFilter !== "all") {
    result = result.filter(
      (doc) => libraryFileKind(doc.file_name) === kindFilter,
    );
  }
  const q = query.trim().toLowerCase();
  if (!q) return result;
  return result.filter((doc) => {
    const kind = libraryFileKind(doc.file_name).toLowerCase();
    return (
      doc.file_name.toLowerCase().includes(q) ||
      kind.includes(q) ||
      fileExtension(doc.file_name).includes(q)
    );
  });
}
