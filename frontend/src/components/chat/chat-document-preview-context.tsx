"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SourceBBox, SourceItem } from "@/types/chat";

export interface OpenDocumentPreview {
  documentId: string;
  fileName: string;
  pageNumber?: number | null;
  snippet?: string | null;
  sectionTitle?: string | null;
  citationIndex?: number | null;
  bbox?: SourceBBox | null;
  chunkId?: string | null;
}

interface ChatDocumentPreviewContextValue {
  preview: OpenDocumentPreview | null;
  panelSources: SourceItem[];
  activeCitationIndex: number | null;
  openPreview: (doc: OpenDocumentPreview) => void;
  openFromSource: (source: SourceItem, citationIndex: number) => void;
  setPanelSources: (sources: SourceItem[]) => void;
  closePreview: () => void;
}

const ChatDocumentPreviewContext =
  createContext<ChatDocumentPreviewContextValue | null>(null);

export function ChatDocumentPreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<OpenDocumentPreview | null>(null);
  const [panelSources, setPanelSources] = useState<SourceItem[]>([]);
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(
    null,
  );

  const openPreview = useCallback((doc: OpenDocumentPreview) => {
    setPreview(doc);
    if (doc.citationIndex != null) setActiveCitationIndex(doc.citationIndex);
  }, []);

  const openFromSource = useCallback((source: SourceItem, citationIndex: number) => {
    if (!source.document_id) return;
    setActiveCitationIndex(citationIndex);
    setPreview({
      documentId: source.document_id,
      fileName: source.file_name,
      pageNumber: source.page_number,
      snippet: source.snippet,
      sectionTitle: source.section_title,
      citationIndex,
      bbox: source.bbox ?? null,
      chunkId: source.chunk_id ?? null,
    });
  }, []);

  const closePreview = useCallback(() => {
    setPreview(null);
    setActiveCitationIndex(null);
  }, []);

  const value = useMemo(
    () => ({
      preview,
      panelSources,
      activeCitationIndex,
      openPreview,
      openFromSource,
      setPanelSources,
      closePreview,
    }),
    [
      preview,
      panelSources,
      activeCitationIndex,
      openPreview,
      openFromSource,
      closePreview,
    ],
  );

  return (
    <ChatDocumentPreviewContext.Provider value={value}>
      {children}
    </ChatDocumentPreviewContext.Provider>
  );
}

export function useChatDocumentPreview() {
  const ctx = useContext(ChatDocumentPreviewContext);
  if (!ctx) {
    throw new Error(
      "useChatDocumentPreview must be used within ChatDocumentPreviewProvider",
    );
  }
  return ctx;
}
