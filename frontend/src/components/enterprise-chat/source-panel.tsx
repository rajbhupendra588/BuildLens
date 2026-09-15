"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  GripVertical,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { SourceItem } from "@/types/chat";
import { DocumentPreviewPane } from "@/components/documents/document-preview-pane";
import { EvidenceHighlight } from "./evidence-highlight";
import { SourceDocument } from "./source-document";
import { Button } from "@/components/ui/button";
import { useSourcePanelWidth } from "@/hooks/use-source-panel-width";
import { fetchDocumentBlob } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { OpenDocumentPreview } from "@/components/chat/chat-document-preview-context";

interface SourcePanelProps {
  preview: OpenDocumentPreview | null;
  sources: SourceItem[];
  activeCitationIndex?: number | null;
  onSelectSource: (source: SourceItem, index: number) => void;
  onClose: () => void;
  className?: string;
}

export function SourcePanel({
  preview,
  sources,
  activeCitationIndex,
  onSelectSource,
  onClose,
  className,
}: SourcePanelProps) {
  const { width, setWidth, min, max, collapsed, setCollapsed } =
    useSourcePanelWidth();

  useEffect(() => {
    if (preview) setCollapsed(false);
  }, [preview, setCollapsed]);
  const [zoom, setZoom] = useState(100);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && preview) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, onClose]);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: width };
      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startX - ev.clientX;
        setWidth(dragRef.current.startW + delta);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setWidth, width],
  );

  const openDocumentFile = useCallback((documentId: string) => {
    void fetchDocumentBlob(documentId).then((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }, []);

  const downloadDocumentFile = useCallback(
    (documentId: string, fileName: string) => {
      void fetchDocumentBlob(documentId).then((blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      });
    },
    [],
  );

  if (collapsed) {
    return (
      <div className={cn("hidden lg:flex shrink-0 border-l border-border", className)}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-full rounded-none px-2 writing-mode-vertical"
          onClick={() => setCollapsed(false)}
          aria-label="Show sources panel"
        >
          Sources
        </Button>
      </div>
    );
  }

  const showPreview = Boolean(preview?.documentId);

  return (
    <aside
      className={cn(
        "hidden lg:flex relative shrink-0 flex-col min-h-0 border-l border-border bg-[var(--enterprise-surface)]",
        className,
      )}
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sources panel"
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/20 z-10 flex items-center justify-center"
        onPointerDown={onResizePointerDown}
      >
        <GripVertical className="size-3 text-muted-foreground/50 pointer-events-none" />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 pl-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Sources
          </p>
          {preview ? (
            <p className="text-[13px] font-medium truncate max-w-[240px]">
              {preview.fileName}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Collapse panel"
            onClick={() => setCollapsed(true)}
          >
            <Minimize2 className="size-3.5" />
          </Button>
          {preview ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Close preview"
              onClick={onClose}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {!sources.length && !preview ? (
          <p className="text-[13px] text-muted-foreground leading-relaxed px-1">
            Sources will appear here after you ask a question.
          </p>
        ) : null}

        {sources.length > 0 ? (
          <div className="space-y-2">
            {sources.map((source, i) => (
              <SourceDocument
                key={`${source.document_id ?? source.file_name}-${i}`}
                source={source}
                index={i + 1}
                active={activeCitationIndex === i + 1}
                onSelect={() => onSelectSource(source, i + 1)}
              />
            ))}
          </div>
        ) : null}

        {showPreview && preview ? (
          <div className="rounded-md border border-border overflow-hidden bg-[var(--enterprise-elevated)]">
            <div className="flex items-center justify-between gap-1 border-b border-border px-2 py-1.5">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {preview.pageNumber ? `Page ${preview.pageNumber}` : "Preview"}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                >
                  <ZoomOut className="size-3.5" />
                </Button>
                <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-center">
                  {zoom}%
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(200, z + 10))}
                >
                  <ZoomIn className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Fit width"
                  onClick={() => setZoom(100)}
                >
                  Fit
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Previous page"
                  disabled={!preview.pageNumber || preview.pageNumber <= 1}
                  onClick={() =>
                    onSelectSource(
                      {
                        document_id: preview.documentId,
                        file_name: preview.fileName,
                        score: 0,
                        snippet: preview.snippet ?? "",
                        page_number: Math.max(1, (preview.pageNumber ?? 1) - 1),
                      },
                      activeCitationIndex ?? 1,
                    )
                  }
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Next page"
                  onClick={() =>
                    onSelectSource(
                      {
                        document_id: preview.documentId,
                        file_name: preview.fileName,
                        score: 0,
                        snippet: preview.snippet ?? "",
                        page_number: (preview.pageNumber ?? 1) + 1,
                      },
                      activeCitationIndex ?? 1,
                    )
                  }
                >
                  <ChevronRight className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Open document"
                  onClick={() => openDocumentFile(preview.documentId)}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Download document"
                  onClick={() =>
                    downloadDocumentFile(preview.documentId, preview.fileName)
                  }
                >
                  <Download className="size-3.5" />
                </Button>
              </div>
            </div>
            <EvidenceHighlight excerpt={preview.snippet} />
            <div
              className="origin-top transition-transform"
              style={{ transform: `scale(${zoom / 100})` }}
            >
              <DocumentPreviewPane
                documentId={preview.documentId}
                fileName={preview.fileName}
                pageNumber={preview.pageNumber}
                highlightSnippet={preview.snippet}
                bbox={preview.bbox}
                hidePdfPageControls
                contentClassName="h-[min(420px,45vh)]"
                className="flex-1"
              />
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
