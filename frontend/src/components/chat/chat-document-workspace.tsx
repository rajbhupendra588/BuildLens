"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { DocumentPreviewPane } from "@/components/documents/document-preview-pane";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useChatDocumentPreview } from "./chat-document-preview-context";
import { cn } from "@/lib/utils";

interface ChatDocumentWorkspaceProps {
  children: ReactNode;
}

export function ChatDocumentWorkspace({ children }: ChatDocumentWorkspaceProps) {
  const { preview, closePreview } = useChatDocumentPreview();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const showSidePanel = Boolean(preview && isDesktop);
  const showSheet = Boolean(preview && !isDesktop);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          showSidePanel && "lg:max-w-[60%]",
        )}
      >
        {children}
      </div>

      {showSidePanel && preview ? (
        <aside className="hidden lg:flex min-h-0 w-[40%] min-w-[280px] flex-col border-l bg-card">
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {preview.fileName}
            </p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={closePreview}
              title="Close preview"
            >
              <X className="size-4" />
            </Button>
          </div>
          <DocumentPreviewPane
            documentId={preview.documentId}
            fileName={preview.fileName}
            pageNumber={preview.pageNumber}
            contentClassName="h-[calc(100svh-8rem)]"
            className="flex-1"
          />
        </aside>
      ) : null}

      <Sheet
        open={showSheet}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="truncate pr-6">
              {preview?.fileName ?? "Preview"}
            </SheetTitle>
          </SheetHeader>
          {preview ? (
            <DocumentPreviewPane
              documentId={preview.documentId}
              fileName={preview.fileName}
              pageNumber={preview.pageNumber}
              contentClassName="h-[calc(100svh-6rem)]"
              className="flex-1"
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
