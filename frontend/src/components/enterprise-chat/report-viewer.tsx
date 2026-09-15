"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fetchReport, fetchReportPdfBlob } from "@/lib/api";
import { useReportStore } from "@/hooks/use-report-store";
import { useChatDocumentPreview } from "@/components/chat/chat-document-preview-context";
import type { SourceItem } from "@/types/chat";
import type {
  ReportContent,
  ReportPayload,
  ReportSource,
} from "@/types/report";
import { Citation } from "./citation";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function sourceItemFromReport(source: ReportSource): SourceItem {
  return {
    document_id: source.document_id,
    chunk_id: source.chunk_id,
    file_name: source.file_name,
    score: 1,
    snippet: source.snippet || "",
    page_number: source.page_number,
    section_title: source.section_title,
    location_label: source.location_label,
    source_index: source.index,
    element_type: source.element_type,
  };
}

function Cite({
  index,
  sources,
  onSelect,
}: {
  index?: number | null;
  sources: ReportSource[];
  onSelect: (source: SourceItem, index: number) => void;
}) {
  if (!index) return null;
  const source = sources.find((s) => s.index === index);
  if (!source) return <sup className="text-[11px] text-muted-foreground">[{index}]</sup>;
  return (
    <Citation
      index={index}
      source={sourceItemFromReport(source)}
      onSelect={onSelect}
    />
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="mb-2 border-b border-border pb-1 text-[13px] font-semibold tracking-wide text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function CompactTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  if (!rows.length) return null;
  return (
    <Table className="text-[12px]">
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h} className="h-8 px-2 text-[11px]">
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={`${row[0]}-${i}`}>
            {row.map((cell, j) => (
              <TableCell key={`${i}-${j}`} className="px-2 py-1.5 whitespace-normal">
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReportDocumentView({
  content,
  onCite,
}: {
  content: ReportContent;
  onCite: (source: SourceItem, index: number) => void;
}) {
  const sources = content.sources ?? [];
  const cite = (index?: number | null) => (
    <Cite index={index} sources={sources} onSelect={onCite} />
  );
  const names = content.document_names ?? [];
  const scope =
    names.length === 1
      ? names[0]
      : names.length
        ? `${names.length} selected documents`
        : "Uploaded documents";
  const profile = content.document_profile;
  const profileRows = profile
    ? [
        profile.document_type,
        profile.revision,
        profile.author,
        profile.organization,
        profile.creation_date,
        profile.approval_date,
        profile.effective_date,
        profile.page_count,
        profile.language,
        profile.status,
      ].filter(Boolean)
    : [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 text-[13.5px] leading-relaxed">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--enterprise-accent)]">
        BUILDLENS DOCUMENT REPORT
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">
        {content.title || "Document Report"}
      </h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Generated from: {scope}
      </p>
      {content.limitations ? (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
          {content.limitations}
        </p>
      ) : null}

      {content.executive_summary ? (
        <Section title="Executive Summary">
          <p className="whitespace-pre-wrap">{content.executive_summary}</p>
        </Section>
      ) : null}

      {profileRows.length ? (
        <Section title="Document Profile">
          <CompactTable
            headers={["Field", "Value", "Evidence"]}
            rows={profileRows.map((f) => [
              f?.label ?? "",
              f?.value ?? "Not specified in the document.",
              f?.evidence?.replaceAll("_", " ") ?? "NOT SPECIFIED",
            ])}
          />
        </Section>
      ) : null}

      {content.purpose ? (
        <Section title="Document Purpose">
          <p className="whitespace-pre-wrap">{content.purpose}</p>
        </Section>
      ) : null}

      {content.top_findings?.length ? (
        <Section title="Key Findings">
          <ol className="list-decimal space-y-1.5 pl-5">
            {content.top_findings.map((item, i) => (
              <li key={`${item.text}-${i}`}>
                {item.text}
                {cite(item.source_index)}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {content.key_facts?.length ? (
        <Section title="Key Facts">
          <CompactTable
            headers={["Attribute", "Value", "Source"]}
            rows={content.key_facts.map((f) => [
              f.attribute,
              f.value,
              f.source_index ? `[${f.source_index}]` : "—",
            ])}
          />
        </Section>
      ) : null}

      {content.metrics?.length ? (
        <Section title="Key Numbers and Metrics">
          <CompactTable
            headers={["Metric", "Value", "Context"]}
            rows={content.metrics.map((m) => [
              m.metric,
              m.value,
              m.calculated
                ? "Calculated from source data."
                : m.context || "",
            ])}
          />
        </Section>
      ) : null}

      {content.requirements?.length ? (
        <Section title="Key Requirements">
          {content.requirements.map((group) => (
            <div key={group.category} className="mb-3">
              <p className="mb-1 text-[12px] font-semibold">{group.category}</p>
              <ul className="list-disc space-y-1 pl-5">
                {group.items.map((item, i) => (
                  <li key={`${item.text}-${i}`}>
                    {item.text}
                    {cite(item.source_index)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      ) : null}

      {content.milestones?.length ? (
        <Section title="Dates and Milestones">
          <CompactTable
            headers={["Milestone", "Date", "Source"]}
            rows={content.milestones.map((m) => [
              m.milestone,
              m.date,
              m.source_index ? `[${m.source_index}]` : "Not specified.",
            ])}
          />
        </Section>
      ) : null}

      {content.entities?.length ? (
        <Section title="Entities">
          {content.entities.map((group) => (
            <p key={group.category} className="mb-1">
              <span className="font-medium">{group.category}: </span>
              {group.items.map((item, i) => (
                <span key={`${item.text}-${i}`}>
                  {i > 0 ? "; " : ""}
                  {item.text}
                  {cite(item.source_index)}
                </span>
              ))}
            </p>
          ))}
        </Section>
      ) : null}

      {content.tables?.length ? (
        <Section title="Important Tables">
          {content.tables.map((tbl, i) => (
            <div key={`${tbl.title}-${i}`} className="mb-3">
              <p className="font-medium">
                {tbl.title}
                {cite(tbl.source_index)}
              </p>
              {tbl.summary ? (
                <p className="text-muted-foreground">{tbl.summary}</p>
              ) : null}
              {tbl.rows?.length ? (
                <CompactTable
                  headers={tbl.rows[0]}
                  rows={tbl.rows.slice(1)}
                />
              ) : null}
            </div>
          ))}
        </Section>
      ) : null}

      {content.figures?.length ? (
        <Section title="Figures / Drawings">
          {content.figures.map((fig, i) => (
            <p key={`${fig.title}-${i}`} className="mb-2">
              <span className="font-medium">{fig.title}</span>
              {cite(fig.source_index)}
              {fig.sheet ? ` · Sheet ${fig.sheet}` : ""}
              {fig.purpose ? ` — ${fig.purpose}` : ""}
            </p>
          ))}
        </Section>
      ) : null}

      {content.risks?.length ? (
        <Section title="Risks and Issues">
          {content.risks.map((risk, i) => (
            <div key={`${risk.risk}-${i}`} className="mb-3 rounded-md border border-border/70 p-3">
              <p>
                <span className="font-semibold">RISK: </span>
                {risk.risk}
                {cite(risk.source_index)}
              </p>
              {risk.category ? (
                <p className="text-[12px] text-muted-foreground">{risk.category}</p>
              ) : null}
              <p>
                <span className="font-medium">Impact: </span>
                {risk.impact}
              </p>
              <p>
                <span className="font-medium">Mitigation: </span>
                {risk.mitigation_is_recommendation
                  ? `BuildLens Recommendation: ${risk.mitigation}`
                  : risk.mitigation}
              </p>
            </div>
          ))}
        </Section>
      ) : null}

      {content.gaps?.length ? (
        <Section title="Gaps and Missing Information">
          {content.gaps.map((gap, i) => (
            <div key={`${gap.gap}-${i}`} className="mb-2">
              <p>
                <span className="font-semibold">GAP: </span>
                {gap.gap}
                {cite(gap.source_index)}
              </p>
              {gap.impact ? (
                <p className="text-muted-foreground">Impact: {gap.impact}</p>
              ) : null}
            </div>
          ))}
        </Section>
      ) : null}

      {(content.conflicts?.length || content.cross_document_findings?.length) ? (
        <Section title="Inconsistencies and Conflicts">
          {[
            ...(content.cross_document_findings ?? []),
            ...(content.conflicts ?? []),
          ].map((conflict, i) => (
            <div key={`${conflict.topic}-${i}`} className="mb-3">
              <p className="font-semibold">CONFLICT FOUND — {conflict.topic}</p>
              <ul className="list-disc pl-5">
                {conflict.statements.map((stmt, j) => (
                  <li key={`${stmt.text}-${j}`}>
                    {stmt.text}
                    {cite(stmt.source_index)}
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-muted-foreground">
                {conflict.status || "Requires clarification."}
              </p>
            </div>
          ))}
        </Section>
      ) : null}

      {content.decisions?.length ? (
        <Section title="Decisions">
          {content.decisions.map((item, i) => (
            <p key={`${item.decision}-${i}`} className="mb-2">
              <span className="font-medium">Decision: </span>
              {item.decision}
              {cite(item.source_index)}
              <span className="block text-muted-foreground">
                Rationale: {item.rationale}
              </span>
            </p>
          ))}
        </Section>
      ) : null}

      {(content.actions?.length || content.document_actions?.length) ? (
        <Section title="Action Items">
          {content.actions?.length ? (
            <CompactTable
              headers={["Action", "Owner", "Due Date", "Source"]}
              rows={content.actions.map((a) => [
                a.action,
                a.owner || "Not specified",
                a.due || "Not specified",
                a.source_index ? `[${a.source_index}]` : "—",
              ])}
            />
          ) : null}
          {content.document_actions?.map((item, i) => (
            <p key={`${item.text}-${i}`} className="mt-1">
              • {item.text}
              {cite(item.source_index)}
            </p>
          ))}
        </Section>
      ) : null}

      {content.observations?.length ? (
        <Section title="BuildLens Observations">
          <p className="mb-2 text-[12px] text-muted-foreground">
            The following items are BuildLens observations, not statements from
            the document.
          </p>
          <ul className="list-disc space-y-1 pl-5 italic">
            {content.observations.map((obs) => (
              <li key={obs}>{obs}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {sources.length ? (
        <Section title="Source References">
          <ol className="space-y-1.5">
            {sources.map((src) => {
              const item = sourceItemFromReport(src);
              return (
                <li key={src.index} className="text-[12px]">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => onCite(item, src.index)}
                  >
                    [{src.index}] {src.file_name}
                    {src.page_number ? ` — Page ${src.page_number}` : src.location_label ? ` — ${src.location_label}` : ""}
                    {src.section_title ? ` — ${src.section_title}` : ""}
                  </button>
                </li>
              );
            })}
          </ol>
        </Section>
      ) : null}
    </div>
  );
}

function PdfPages({
  reportId,
  zoom,
  page,
  onPages,
  search,
}: {
  reportId: string;
  zoom: number;
  page: number;
  onPages: (n: number) => void;
  search: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(0);
  const pdfRef = useRef<pdfjs.PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchReportPdfBlob(reportId)
      .then((blob) => blob.arrayBuffer())
      .then((data) => pdfjs.getDocument({ data }).promise)
      .then((pdf) => {
        if (cancelled) return;
        pdfRef.current = pdf;
        onPages(pdf.numPages);
        setReady((n) => n + 1);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the report PDF.");
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, onPages]);

  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    let cancelled = false;
    pdf.getPage(page).then(async (pdfPage) => {
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: zoom });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      if (!search.trim()) return;
      try {
        const text = await pdfPage.getTextContent();
        const needle = search.trim().toLowerCase();
        ctx.save();
        ctx.fillStyle = "rgba(250, 204, 21, 0.35)";
        for (const item of text.items) {
          if (!("str" in item) || !item.str.toLowerCase().includes(needle)) continue;
          const tx = pdfjs.Util.transform(viewport.transform, item.transform);
          const w = item.width * zoom;
          const h = (item.height || 8) * zoom;
          ctx.fillRect(tx[4], tx[5] - h, w, h);
        }
        ctx.restore();
      } catch {
        // search highlight is optional
      }
    });
    return () => {
      cancelled = true;
    };
  }, [page, zoom, search, reportId, ready]);

  if (error) {
    return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
  }
  return (
    <div className="flex justify-center overflow-auto p-4">
      <canvas ref={canvasRef} className="max-w-full shadow-md bg-white" />
    </div>
  );
}

export function ReportViewer() {
  const { viewerOpen, viewerReport, viewerReportId, closeViewer, setActiveReport } =
    useReportStore();
  const { openFromSource, setPanelSources } = useChatDocumentPreview();
  const [tab, setTab] = useState<"report" | "pdf">("report");
  const [fullscreen, setFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1.15);
  const [loaded, setLoaded] = useState<ReportPayload | null>(viewerReport);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoaded(viewerReport);
    setTab("report");
    setPage(1);
    setQuery("");
  }, [viewerReportId, viewerReport]);

  useEffect(() => {
    if (!viewerOpen || !viewerReportId) return;
    if (viewerReport?.content || viewerReport?.sections) return;
    fetchReport(viewerReportId)
      .then(setLoaded)
      .catch(() => undefined);
  }, [viewerOpen, viewerReportId, viewerReport]);

  const content = loaded?.content ?? loaded?.sections ?? null;
  const sources = content?.sources ?? [];

  useEffect(() => {
    if (!viewerOpen) return;
    setPanelSources(sources.map(sourceItemFromReport));
  }, [viewerOpen, sources, setPanelSources]);

  const handleCite = useCallback(
    (source: SourceItem, index: number) => {
      openFromSource(source, index);
    },
    [openFromSource],
  );

  const handleDownload = useCallback(async () => {
    if (!viewerReportId) return;
    const blob = await fetchReportPdfBlob(viewerReportId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = loaded?.downloadName || `BuildLens_Report.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [viewerReportId, loaded?.downloadName]);

  const handleAsk = useCallback(() => {
    if (!viewerReportId) return;
    setActiveReport(viewerReportId, loaded?.title ?? "Generated Report");
    document.getElementById("chat-composer-input")?.focus();
  }, [viewerReportId, loaded?.title, setActiveReport]);

  const filteredContent = useMemo(() => {
    if (!content || !query.trim() || tab !== "report") return content;
    const q = query.trim().toLowerCase();
    const blob = JSON.stringify(content).toLowerCase();
    if (!blob.includes(q)) return content;
    return content;
  }, [content, query, tab]);

  if (!viewerOpen || !viewerReportId) return null;

  const scope =
    loaded?.documentNames?.length === 1
      ? loaded.documentNames[0]
      : loaded?.documentNames?.length
        ? `${loaded.documentNames.length} selected documents`
        : "Uploaded documents";

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-background",
        fullscreen ? "p-0" : "sm:p-6 sm:bg-black/50",
      )}
      role="dialog"
      aria-label="Document Report"
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col bg-background",
          !fullscreen && "sm:mx-auto sm:w-full sm:max-w-5xl sm:rounded-xl sm:border sm:shadow-xl",
        )}
      >
        <header className="flex shrink-0 flex-col gap-2 border-b px-4 py-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">Document Report</h2>
            <p className="truncate text-[12px] text-muted-foreground">
              Generated from: {scope}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search report"
                className="h-8 w-40 pl-7 text-xs md:w-52"
              />
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => void handleDownload()}>
              <Download className="size-3.5" />
              Download PDF
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={handleAsk}>
              Ask about this report
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Close"
              onClick={closeViewer}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex shrink-0 items-center gap-1 border-b px-4">
          <button
            type="button"
            className={cn(
              "px-3 py-2 text-[12px] font-medium border-b-2 -mb-px",
              tab === "report"
                ? "border-[var(--enterprise-accent)] text-foreground"
                : "border-transparent text-muted-foreground",
            )}
            onClick={() => setTab("report")}
          >
            Report
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-2 text-[12px] font-medium border-b-2 -mb-px",
              tab === "pdf"
                ? "border-[var(--enterprise-accent)] text-foreground"
                : "border-transparent text-muted-foreground",
            )}
            onClick={() => setTab("pdf")}
          >
            PDF
          </button>
          {tab === "pdf" ? (
            <div className="ml-auto flex items-center gap-1 py-1">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="min-w-16 text-center text-[11px] tabular-nums text-muted-foreground">
                {page} / {pages}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
              >
                <ChevronRight className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => setZoom((z) => Math.min(2.2, z + 0.15))}
              >
                <ZoomIn className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {tab === "report" && filteredContent ? (
            <ReportDocumentView content={filteredContent} onCite={handleCite} />
          ) : tab === "pdf" ? (
            <PdfPages
              reportId={viewerReportId}
              zoom={zoom}
              page={page}
              onPages={setPages}
              search={query}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Loading report…</p>
          )}
        </div>
      </div>
    </div>
  );
}
