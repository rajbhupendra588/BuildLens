export type DocumentScopeId =
  | "all"
  | "architectural"
  | "structural"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "boq"
  | "contracts"
  | "approvals"
  | "site-reports"
  | "specifications";

export interface DocumentScopeOption {
  id: DocumentScopeId;
  label: string;
  /** Keywords matched against file names for collection filtering (UI). */
  keywords: string[];
}

export const DOCUMENT_SCOPE_OPTIONS: DocumentScopeOption[] = [
  { id: "all", label: "All Project Documents", keywords: [] },
  {
    id: "architectural",
    label: "Architectural",
    keywords: ["arch", "architectural", "a-", "floor plan", "elevation"],
  },
  {
    id: "structural",
    label: "Structural",
    keywords: ["struct", "structural", "s-", "foundation", "rebar"],
  },
  {
    id: "electrical",
    label: "Electrical",
    keywords: ["electrical", "elec", "e-", "lighting", "load"],
  },
  {
    id: "plumbing",
    label: "Plumbing",
    keywords: ["plumb", "plumbing", "p-", "sanitary"],
  },
  { id: "hvac", label: "HVAC", keywords: ["hvac", "mechanical", "m-", "duct"] },
  { id: "boq", label: "BOQ", keywords: ["boq", "bill of quantities", "quantity"] },
  {
    id: "contracts",
    label: "Contracts",
    keywords: ["contract", "agreement", "tender"],
  },
  {
    id: "approvals",
    label: "Approvals",
    keywords: ["approval", "permit", "noc"],
  },
  {
    id: "site-reports",
    label: "Site Reports",
    keywords: ["site report", "daily report", "progress"],
  },
  {
    id: "specifications",
    label: "Specifications",
    keywords: ["spec", "specification", "technical spec"],
  },
];

export function scopeLabel(scopeId: DocumentScopeId): string {
  return (
    DOCUMENT_SCOPE_OPTIONS.find((o) => o.id === scopeId)?.label ??
    "All Project Documents"
  );
}

export function fileMatchesScope(
  fileName: string,
  scopeId: DocumentScopeId,
): boolean {
  if (scopeId === "all") return true;
  const opt = DOCUMENT_SCOPE_OPTIONS.find((o) => o.id === scopeId);
  if (!opt?.keywords.length) return true;
  const lower = fileName.toLowerCase();
  return opt.keywords.some((k) => lower.includes(k));
}
