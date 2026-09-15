"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { FileIcon } from "@/components/library/file-icon";
import { Button } from "@/components/ui/button";
import { fetchDocumentBlob } from "@/lib/api";
import { AuthenticatedDocumentImage } from "@/components/documents/authenticated-document-image";
import {
  isImageFileName,
  isPdfFileName,
} from "@/lib/collect-dropped-files";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const PdfEvidenceViewer = dynamic(
  () =>
    import("./pdf-evidence-viewer").then((mod) => mod.PdfEvidenceViewer),
  { ssr: false, loading: () => <p className="p-4 text-xs text-muted-foreground">Loading PDF…</p> },
);
import type { SourceBBox } from "@/types/chat";

const TEXT_PREVIEW_EXTS = new Set([
  "txt",
  "md",
  "json",
  "csv",
  "xml",
  "yaml",
  "yml",
  "html",
  "htm",
  "py",
  "js",
  "ts",
  "tsx",
  "jsx",
  "sh",
  "sql",
]);

export interface DocumentPreviewPaneProps {
  documentId: string;
  fileName: string;
  pageNumber?: number | null;
  highlightSnippet?: string | null;
  bbox?: SourceBBox | null;
  className?: string;
  /** iframe / image max height class */
  contentClassName?: string;
  /** When true, PDF prev/next is handled by a parent (e.g. source panel toolbar). */
  hidePdfPageControls?: boolean;
}

function highlightExcerpt(full: string, snippet: string): ReactNode {
  const needle = snippet.trim().slice(0, 80);
  if (!needle || needle.length < 8) return full;
  const idx = full.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return full;
  const end = idx + needle.length;
  return (
    <>
      {full.slice(0, idx)}
      <mark className="rounded-sm bg-[var(--enterprise-accent)]/25 px-0.5 text-foreground">
        {full.slice(idx, end)}
      </mark>
      {full.slice(end)}
    </>
  );
}

export function DocumentPreviewPane({
  documentId,
  fileName,
  pageNumber,
  highlightSnippet,
  bbox,
  className,
  contentClassName,
  hidePdfPageControls = false,
}: DocumentPreviewPaneProps) {
  const image = isImageFileName(fileName);
  const pdf = isPdfFileName(fileName);
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const textPreview = TEXT_PREVIEW_EXTS.has(ext);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  useEffect(() => {
    if (!textPreview) {
      setTextContent(null);
      setTextError(null);
      setTextLoading(false);
      return;
    }

    let cancelled = false;
    setTextLoading(true);
    setTextError(null);
    fetchDocumentBlob(documentId)
      .then((blob) => blob.text())
      .then((body) => {
        if (!cancelled) setTextContent(body);
      })
      .catch((err) => {
        if (!cancelled) {
          setTextError(
            err instanceof Error ? err.message : "Could not load preview",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, textPreview]);

  const heightClass = contentClassName ?? "h-[70vh]";

  return (
    <div className={cn("min-h-0 flex-1 overflow-auto bg-muted/30", className)}>
      {image ? (
        <div className="flex justify-center p-4">
          <AuthenticatedDocumentImage
            documentId={documentId}
            alt={fileName}
            className={cn(
              "max-w-full rounded-md object-contain",
              heightClass,
              "max-h-[70vh]",
            )}
          />
        </div>
      ) : pdf ? (
        <div className="p-2">
          <PdfEvidenceViewer
            documentId={documentId}
            pageNumber={pageNumber}
            bbox={bbox}
            heightClass={heightClass}
            hidePageControls={hidePdfPageControls}
          />
        </div>
      ) : textPreview ? (
        <div className="p-4">
          {textLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : textError ? (
            <p className="text-sm text-destructive">{textError}</p>
          ) : (
            <pre className="max-h-[70vh] overflow-auto rounded-md border bg-background p-4 text-xs leading-relaxed whitespace-pre-wrap break-words">
              {highlightSnippet && textContent
                ? highlightExcerpt(textContent, highlightSnippet)
                : textContent}
            </pre>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <FileIcon name={fileName} className="size-10" />
          <p className="text-sm text-muted-foreground">
            Preview is not available for this file type. Download to open it
            locally.
          </p>
          <Button
            type="button"
            onClick={() => {
              void fetchDocumentBlob(documentId).then((blob) => {
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = fileName;
                anchor.click();
                URL.revokeObjectURL(url);
              });
            }}
          >
            <Download className="size-4" />
            Download
          </Button>
        </div>
      )}
    </div>
  );
}
