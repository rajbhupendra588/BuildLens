"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DocumentPreviewPane } from "@/components/documents/document-preview-pane";
import { SourcePanel } from "@/components/enterprise-chat/source-panel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useChatDocumentPreview } from "./chat-document-preview-context";

interface ChatDocumentWorkspaceProps {
  children: ReactNode;
}

export function ChatDocumentWorkspace({ children }: ChatDocumentWorkspaceProps) {
  const {
    preview,
    panelSources,
    activeCitationIndex,
    openFromSource,
    closePreview,
  } = useChatDocumentPreview();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const showSheet = Boolean(preview && !isDesktop);

  return (
    <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col min-h-0 overflow-hidden">
        {children}
      </div>

      {isDesktop ? (
        <SourcePanel
          preview={preview}
          sources={panelSources}
          activeCitationIndex={activeCitationIndex}
          onSelectSource={openFromSource}
          onClose={closePreview}
        />
      ) : null}

      <Sheet
        open={showSheet}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <SheetContent side="bottom" className="flex max-h-[85vh] flex-col p-0">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="truncate pr-6">
              {preview?.fileName ?? "Sources"}
            </SheetTitle>
          </SheetHeader>
          {preview ? (
            <DocumentPreviewPane
              documentId={preview.documentId}
              fileName={preview.fileName}
              pageNumber={preview.pageNumber}
              highlightSnippet={preview.snippet}
              bbox={preview.bbox}
              contentClassName="h-[50vh]"
              className="flex-1"
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
