"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { FileIcon } from "@/components/library/file-icon";
import { Button } from "@/components/ui/button";
import { documentFileUrl } from "@/lib/api";
import {
  isImageFileName,
  isPdfFileName,
} from "@/lib/collect-dropped-files";
import { cn } from "@/lib/utils";

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
  className?: string;
  /** iframe / image max height class */
  contentClassName?: string;
}

function pdfSrc(base: string, pageNumber?: number | null): string {
  if (!pageNumber || pageNumber < 1) return base;
  return `${base}#page=${pageNumber}`;
}

export function DocumentPreviewPane({
  documentId,
  fileName,
  pageNumber,
  className,
  contentClassName,
}: DocumentPreviewPaneProps) {
  const baseSrc = documentFileUrl(documentId);
  const src = useMemo(
    () => pdfSrc(baseSrc, pageNumber),
    [baseSrc, pageNumber],
  );
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
    fetch(baseSrc)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load file");
        return res.text();
      })
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
  }, [baseSrc, textPreview]);

  const heightClass = contentClassName ?? "h-[70vh]";

  return (
    <div className={cn("min-h-0 flex-1 overflow-auto bg-muted/30", className)}>
      {image ? (
        <div className="flex justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={baseSrc}
            alt={fileName}
            className={cn(
              "max-w-full rounded-md object-contain",
              heightClass,
              "max-h-[70vh]",
            )}
          />
        </div>
      ) : pdf ? (
        <iframe
          key={src}
          title={fileName}
          src={src}
          className={cn("w-full border-0 bg-background", heightClass)}
        />
      ) : textPreview ? (
        <div className="p-4">
          {textLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : textError ? (
            <p className="text-sm text-destructive">{textError}</p>
          ) : (
            <pre className="max-h-[70vh] overflow-auto rounded-md border bg-background p-4 text-xs leading-relaxed whitespace-pre-wrap break-words">
              {textContent}
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
          <Button asChild>
            <a href={baseSrc} download={fileName}>
              <Download className="size-4" />
              Download
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
