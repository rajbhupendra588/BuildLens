"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { fetchDocumentArrayBuffer } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SourceBBox } from "@/types/chat";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface PdfEvidenceViewerProps {
  documentId: string;
  pageNumber?: number | null;
  onPageNumberChange?: (page: number) => void;
  bbox?: SourceBBox | null;
  className?: string;
  heightClass?: string;
  /** Hide built-in prev/next (e.g. when the parent toolbar handles pages). */
  hidePageControls?: boolean;
}

function rectFromBBox(
  bbox: SourceBBox,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; w: number; h: number } {
  const { l, t, r, b } = bbox;
  const normalized = [l, t, r, b].every((v) => v >= 0 && v <= 1.05);
  if (normalized) {
    const x = l * pageWidth;
    const w = (r - l) * pageWidth;
    const h = (b - t) * pageHeight;
    const y = (1 - b) * pageHeight;
    return { x, y, w, h };
  }
  const x = l;
  const y = pageHeight - b;
  const w = r - l;
  const h = b - t;
  return { x, y, w, h };
}

export function PdfEvidenceViewer({
  documentId,
  pageNumber,
  onPageNumberChange,
  bbox,
  className,
  heightClass,
  hidePageControls = false,
}: PdfEvidenceViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const loadedForIdRef = useRef<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [renderingPage, setRenderingPage] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [internalPage, setInternalPage] = useState(1);

  const controlled = pageNumber != null;
  const currentPage = controlled
    ? Math.max(1, pageNumber ?? 1)
    : internalPage;

  const bboxKey = bbox
    ? `${bbox.l}:${bbox.t}:${bbox.r}:${bbox.b}`
    : "";

  const setPage = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(next, numPages || next));
      if (onPageNumberChange) {
        onPageNumberChange(clamped);
      }
      if (!controlled) {
        setInternalPage(clamped);
      }
    },
    [controlled, numPages, onPageNumberChange],
  );

  useEffect(() => {
    if (controlled && pageNumber != null) {
      setInternalPage(Math.max(1, pageNumber));
    }
  }, [controlled, pageNumber]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (loadedForIdRef.current === documentId && pdfRef.current) {
        setNumPages(pdfRef.current.numPages);
        setLoadingDoc(false);
        return;
      }

      setLoadingDoc(true);
      setError(null);
      pdfRef.current?.destroy();
      pdfRef.current = null;
      loadedForIdRef.current = null;

      try {
        const data = await fetchDocumentArrayBuffer(documentId);
        if (cancelled) return;

        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          void pdf.destroy();
          return;
        }

        pdfRef.current = pdf;
        loadedForIdRef.current = documentId;
        setNumPages(pdf.numPages);
        setLoadingDoc(false);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load PDF",
        );
        setLoadingDoc(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    return () => {
      void pdfRef.current?.destroy();
      pdfRef.current = null;
      loadedForIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null =
      null;
    const canvas = canvasRef.current;
    const pdf = pdfRef.current;

    if (!canvas || !pdf || loadingDoc) return;

    const pageIndex = Math.min(
      Math.max(1, currentPage),
      pdf.numPages,
    );

    setRenderingPage(true);
    setError(null);

    const render = async () => {
      try {
        const page = await pdf.getPage(pageIndex);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const containerWidth =
          wrapRef.current?.clientWidth ?? baseViewport.width;
        const scale = containerWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        });
        await renderTask.promise;
        renderTask = null;

        if (cancelled) return;

        if (bbox) {
          const { x, y, w, h } = rectFromBBox(
            bbox,
            viewport.width,
            viewport.height,
          );
          ctx.save();
          ctx.fillStyle = "rgba(91, 159, 212, 0.22)";
          ctx.strokeStyle = "rgba(91, 159, 212, 0.85)";
          ctx.lineWidth = 2;
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          ctx.restore();
        }

        setRenderingPage(false);
      } catch (err) {
        if (cancelled) return;
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name: string }).name)
            : "";
        if (name === "RenderingCancelledException") return;
        setError(
          err instanceof Error ? err.message : "Could not render PDF page",
        );
        setRenderingPage(false);
      }
    };

    void render();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [loadingDoc, currentPage, bboxKey, bbox, documentId]);

  const showControls =
    !hidePageControls && numPages > 1 && !loadingDoc && !error;
  const busy = loadingDoc || renderingPage;

  return (
    <div ref={wrapRef} className={cn("relative flex w-full flex-col", className)}>
      {showControls ? (
        <div className="sticky top-0 z-10 flex items-center justify-center gap-2 border-b bg-background/95 px-2 py-2 backdrop-blur-sm">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={busy || currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[7rem] text-center text-xs tabular-nums text-muted-foreground">
            Page {Math.min(currentPage, numPages)} of {numPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={busy || currentPage >= numPages}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}

      {busy ? (
        <p className="p-4 text-xs text-muted-foreground">
          {loadingDoc ? "Loading PDF…" : "Rendering page…"}
        </p>
      ) : null}
      {error ? (
        <p className="p-4 text-xs text-destructive">{error}</p>
      ) : (
        <canvas
          ref={canvasRef}
          className={cn("mx-auto max-w-full", heightClass, busy && "hidden")}
        />
      )}
    </div>
  );
}
