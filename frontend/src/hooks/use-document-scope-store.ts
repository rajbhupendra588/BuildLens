"use client";

import { create } from "zustand";
import type { DocumentScopeId } from "@/types/document-scope";

interface DocumentScopeState {
  scopeId: DocumentScopeId;
  scopeSuffix: string | null;
  setScope: (scopeId: DocumentScopeId, suffix?: string | null) => void;
  clearScopeSuffix: () => void;
}

export const useDocumentScopeStore = create<DocumentScopeState>((set) => ({
  scopeId: "all",
  scopeSuffix: null,
  setScope: (scopeId, suffix = null) =>
    set({ scopeId, scopeSuffix: suffix ?? null }),
  clearScopeSuffix: () => set({ scopeSuffix: null }),
}));
