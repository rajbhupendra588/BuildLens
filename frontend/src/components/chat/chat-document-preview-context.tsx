"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface OpenDocumentPreview {
  documentId: string;
  fileName: string;
  pageNumber?: number | null;
}

interface ChatDocumentPreviewContextValue {
  preview: OpenDocumentPreview | null;
  openPreview: (doc: OpenDocumentPreview) => void;
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

  const openPreview = useCallback((doc: OpenDocumentPreview) => {
    setPreview(doc);
  }, []);

  const closePreview = useCallback(() => {
    setPreview(null);
  }, []);

  const value = useMemo(
    () => ({ preview, openPreview, closePreview }),
    [preview, openPreview, closePreview],
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
