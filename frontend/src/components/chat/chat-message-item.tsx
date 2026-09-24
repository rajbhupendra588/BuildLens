"use client";

import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Message, SourceItem } from "@/types/chat";
import { MessageMediaGallery } from "./message-media-gallery";
import { cn } from "@/lib/utils";
import {
  formatChatDay,
  formatChatDateTime,
  formatChatStamp,
} from "@/lib/chat-time";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Copy,
  Check,
  Code2,
  Pencil,
  Undo2,
} from "lucide-react";
import { UserMessage } from "@/components/enterprise-chat/user-message";
import { CitationList } from "@/components/enterprise-chat/citation-list";
import { AnswerActions } from "@/components/enterprise-chat/answer-actions";
import { ConflictState } from "@/components/enterprise-chat/conflict-state";
import { ErrorState } from "@/components/enterprise-chat/error-state";
import { stripTrailingSourcesSection } from "@/lib/strip-message-sources-section";
import { detectConcreteGradeConflicts } from "@/lib/source-conflicts";
import { useChatDocumentPreview } from "./chat-document-preview-context";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { MermaidDiagram } from "./mermaid-diagram";
import { InfographicBlock } from "./infographic-layout";
import {
  BlockReviseProvider,
  EditableBlockFrame,
  plainTextFromNode,
  type BlockReviseRequest,
} from "./block-revise";
import { AsciiArtBlock } from "./ascii-art-block";
import {
  looksLikeAsciiArt,
  wrapAsciiArtBlocksInMarkdown,
} from "@/lib/detect-ascii-art";
import { markdownCodeText } from "@/lib/markdown-code-text";
import { looksLikeInfographicJson } from "@/lib/parse-infographic";
import { ReportCard } from "@/components/enterprise-chat/report-card";
import { isReportMedia } from "@/types/report";
import { useReportStore } from "@/hooks/use-report-store";
import { fetchReport, fetchReportPdfBlob, logApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// ModeBadge — color-coded intent pill rendered below the AI avatar
// ---------------------------------------------------------------------------

const MODE_COLORS: Record<string, string> = {
  GENERAL:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  DOCUMENT_ANALYST:
    "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  CODE_ARCHITECT:
    "bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800",
  CODE_DEBUGGER:
    "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  SUMMARIZER:
    "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  BRIEFING_DOC:
    "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
  STUDY_GUIDE:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800",
  INFOGRAPHIC:
    "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-400 dark:border-fuchsia-800",
  DASHBOARD:
    "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800",
  DOCUMENT_REPORT:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800",
  DATA_ANALYST:
    "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  CREATIVE:
    "bg-pink-50 text-pink-600 border-pink-200 dark:bg-pink-950/40 dark:text-pink-400 dark:border-pink-800",
};

function ModeBadge({
  mode,
  label,
  icon,
}: {
  mode: string;
  label: string;
  icon: string;
}) {
  const colorClass = MODE_COLORS[mode] ?? MODE_COLORS.GENERAL;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
        colorClass,
      )}
      title={label}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CodeBlock
// ---------------------------------------------------------------------------
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard denied — silently fail
    }
  }, [code]);

  const displayLang =
    language.length <= 3
      ? language.toUpperCase()
      : language.charAt(0).toUpperCase() + language.slice(1);

  return (
    <div className="my-4 w-full rounded-xl overflow-hidden bg-[#1e1e1e] text-sm">
      <div className="flex items-center justify-between pl-4 pr-2 py-2.5 bg-[#2a2a2a]">
        <div className="flex items-center gap-2 text-white/60">
          <Code2 className="size-3.5 shrink-0" />
          <span className="font-sans text-xs font-medium">{displayLang}</span>
        </div>
        <button
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          title={copied ? "Copied!" : "Copy code"}
          className={cn(
            "flex items-center justify-center size-7 rounded-md transition-all duration-150",
            copied
              ? "text-emerald-400 bg-emerald-400/10"
              : "text-white/40 hover:text-white/80 hover:bg-white/10",
          )}
        >
          {copied ? (
            <Check className="size-3.5" strokeWidth={2.5} />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>

      <SyntaxHighlighter
        style={vscDarkPlus}
        language={language}
        PreTag="div"
        showLineNumbers={code.split("\n").length > 5}
        lineNumberStyle={{
          minWidth: "2.25em",
          paddingRight: "1em",
          color: "rgba(255,255,255,0.15)",
          userSelect: "none",
        }}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          background: "#1e1e1e",
          fontSize: "0.8125rem",
          lineHeight: "1.65",
          padding: "1.125rem 1.25rem",
          overflowX: "auto",
        }}
        codeTagProps={{
          style: {
            fontFamily: "var(--font-geist-mono, 'Fira Code', monospace)",
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source card helpers
// ---------------------------------------------------------------------------

function MessageTimestamp({ iso, align }: { iso: string; align: "left" | "right" }) {
  const stamp = formatChatStamp(iso);
  if (!stamp) return null;
  return (
    <time
      dateTime={iso}
      title={formatChatDateTime(iso)}
      className={cn(
        "text-[11px] font-chat-sans text-[var(--chat-muted)] tabular-nums",
        align === "right" && "text-right",
      )}
    >
      {stamp}
    </time>
  );
}

function ActionIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
          className="text-muted-foreground hover:text-foreground"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ChatDayDivider({ iso }: { iso: string }) {
  const label = formatChatDay(iso);
  if (!label) return null;
  return (
    <div className="flex items-center gap-3 py-3" role="separator">
      <div className="h-px flex-1 bg-border" />
      <span className="shrink-0 rounded-full border bg-card px-3 py-0.5 font-chat-sans text-[11px] font-medium text-[var(--chat-muted)]">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatMessageItem
// ---------------------------------------------------------------------------
function MarkdownHeading({
  as: Tag,
  className,
  children,
}: {
  as: "h1" | "h2" | "h3";
  className: string;
  children: ReactNode;
}) {
  const title = plainTextFromNode(children).trim();
  if (!title) {
    return <Tag className={className}>{children}</Tag>;
  }
  return (
    <EditableBlockFrame
      target={{ kind: "section", title, type: Tag }}
      className="first:mt-0"
    >
      <Tag className={cn(className, "pr-8")}>{children}</Tag>
    </EditableBlockFrame>
  );
}

export function ChatMessageItem({
  message,
  scopeLabel,
  reportScopeLabel,
  onOpenSource,
  onEdit,
  onReviseBlock,
  onRollback,
  actionsDisabled,
}: {
  message: Message;
  scopeLabel?: string;
  reportScopeLabel?: string;
  onOpenSource?: (source: SourceItem, citationIndex: number) => void;
  onEdit?: (messageId: string, content: string) => void | Promise<void>;
  onReviseBlock?: (request: BlockReviseRequest) => void | Promise<void>;
  onRollback?: (messageId: string) => void | Promise<void>;
  actionsDisabled?: boolean;
}) {
  const { activeCitationIndex } = useChatDocumentPreview();
  const openViewer = useReportStore((s) => s.openViewer);
  const setActiveReport = useReportStore((s) => s.setActiveReport);
  const [copied, setCopied] = useState(false);
  const [sourcesPanelOpen, setSourcesPanelOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard denied — silently fail
    }
  }, [message.content]);

  useEffect(() => {
    if (!isEditing) return;
    const el = editRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditing]);

  if (!message || (!message.content && !message.sources?.length && !isEditing)) {
    return null;
  }

  const isAi = message.role === "assistant";
  const canEdit = !isAi && !!onEdit;
  const canRollback = !!onRollback;

  const startEdit = () => {
    setDraft(message.content);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraft(message.content);
    setIsEditing(false);
  };

  const saveEdit = async () => {
    const next = draft.trim();
    if (!next || !onEdit || next === message.content.trim()) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onEdit(message.id, next);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const actionBar = (
    <div
      className={cn(
        "flex items-center gap-0.5",
      )}
    >
      <ActionIconButton
        label={copied ? "Copied" : "Copy"}
        onClick={() => void handleCopy()}
        disabled={actionsDisabled || !message.content}
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-500" strokeWidth={2.5} />
        ) : (
          <Copy className="size-3.5" />
        )}
      </ActionIconButton>
      {canEdit ? (
        <ActionIconButton
          label="Edit"
          onClick={startEdit}
          disabled={actionsDisabled}
        >
          <Pencil className="size-3.5" />
        </ActionIconButton>
      ) : null}
      {canRollback ? (
        <ActionIconButton
          label="Rollback"
          onClick={() => setConfirmRollback(true)}
          disabled={actionsDisabled}
        >
          <Undo2 className="size-3.5" />
        </ActionIconButton>
      ) : null}
    </div>
  );

  const rollbackDialog = (
    <AlertDialog open={confirmRollback} onOpenChange={setConfirmRollback}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore conversation?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes this message and everything after it so you can continue
            from that point.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              setConfirmRollback(false);
              void onRollback?.(message.id);
            }}
          >
            Rollback
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // User message
  if (!isAi) {
    return (
      <div className="group/msg flex w-full justify-end">
        {isEditing ? (
            <div className="chat-user-bubble w-full max-w-[min(100%,40rem)] rounded-2xl rounded-br-md p-3">
              <textarea
                ref={editRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEdit();
                  }
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void saveEdit();
                  }
                }}
                rows={2}
                className="w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--chat-user-text)] outline-none placeholder:text-[var(--chat-user-text)]/55"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={isSaving}
                  className="text-[var(--chat-user-text)] hover:bg-white/10 hover:text-[var(--chat-user-text)]"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void saveEdit()}
                  disabled={isSaving || !draft.trim()}
                  className="bg-white text-[var(--chat-user-bg)] hover:bg-white/90"
                >
                  Save & submit
                </Button>
              </div>
            </div>
          ) : (
            <UserMessage
              content={message.content}
              scopeLabel={scopeLabel}
              reportScope={
                /^\/report\b/i.test(message.content)
                  ? reportScopeLabel
                  : undefined
              }
              timestamp={
                <MessageTimestamp iso={message.created_at} align="right" />
              }
              actions={!isEditing ? actionBar : null}
            />
          )}
        {rollbackDialog}
      </div>
    );
  }

  const sources = message.sources ?? [];
  const reportMedia = (message.media ?? []).find(isReportMedia);
  const conflict = detectConcreteGradeConflicts(sources);
  const noEvidence =
    !reportMedia &&
    sources.length === 0 &&
    (message.content.length === 0 ||
      /not found|couldn't find|no relevant|insufficient evidence|no evidence/i.test(
        message.content,
      ));

  const rawContent = message.content ?? "";
  const displayContent = stripTrailingSourcesSection(rawContent);
  const markdownContent = wrapAsciiArtBlocksInMarkdown(displayContent);

  // AI message
  return (
    <div className="group/msg flex w-full flex-col items-start py-5 md:py-6">
      {rollbackDialog}
      <div className="min-w-0 w-full">
        <p className="sr-only">Answer</p>
        {noEvidence ? (
          <ErrorState kind="no_evidence" className="mb-3" />
        ) : null}
        {conflict ? <ConflictState conflict={conflict} className="mb-3" /> : null}
        {!noEvidence ? (
        <div className="chat-answer min-w-0">
          {reportMedia ? (
            <ReportCard
              media={reportMedia}
              onOpen={() => {
                void fetchReport(reportMedia.report_id)
                  .then(openViewer)
                  .catch((error) => logApiError("Open report failed", error));
              }}
              onAsk={() => {
                setActiveReport(
                  reportMedia.report_id,
                  reportMedia.title ?? "Generated Report",
                );
                document.getElementById("chat-composer-input")?.focus();
              }}
              onDownload={() => {
                void fetchReportPdfBlob(reportMedia.report_id)
                  .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download =
                      reportMedia.download_name || "BuildLens_Report.pdf";
                    a.click();
                    URL.revokeObjectURL(url);
                  })
                  .catch((error) => logApiError("Download report failed", error));
              }}
            />
          ) : null}
          <MessageMediaGallery media={message.media ?? []} />
          <BlockReviseProvider
            disabled={actionsDisabled}
            onSubmit={onReviseBlock}
          >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p({ children }) {
                return <p className="mb-3.5 last:mb-0">{children}</p>;
              },
              h1({ children }) {
                return (
                  <MarkdownHeading
                    as="h1"
                    className="mt-7 mb-3 text-[1.375rem] font-semibold leading-snug first:mt-0"
                  >
                    {children}
                  </MarkdownHeading>
                );
              },
              h2({ children }) {
                return (
                  <MarkdownHeading
                    as="h2"
                    className="mt-6 mb-2.5 text-[1.1875rem] font-semibold leading-snug first:mt-0"
                  >
                    {children}
                  </MarkdownHeading>
                );
              },
              h3({ children }) {
                return (
                  <MarkdownHeading
                    as="h3"
                    className="mt-5 mb-2 text-[1.0625rem] font-semibold leading-snug first:mt-0"
                  >
                    {children}
                  </MarkdownHeading>
                );
              },
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "");
                const codeString = markdownCodeText(children);
                if (!inline && match) {
                  const lang = match[1].toLowerCase();
                  if (lang === "mermaid") {
                    return (
                      <EditableBlockFrame
                        target={{
                          kind: "section",
                          title: "Diagram",
                          type: "mermaid",
                        }}
                      >
                        <MermaidDiagram chart={codeString} />
                      </EditableBlockFrame>
                    );
                  }
                  if (
                    lang === "infographic" ||
                    ((lang === "json" || lang === "jsonc") &&
                      looksLikeInfographicJson(codeString))
                  ) {
                    return <InfographicBlock rawJson={codeString} />;
                  }
                  return <CodeBlock language={match[1]} code={codeString} />;
                }
                if (!inline && !match && codeString.includes("\n")) {
                  if (looksLikeInfographicJson(codeString)) {
                    return <InfographicBlock rawJson={codeString} />;
                  }
                  if (looksLikeAsciiArt(codeString)) {
                    return <AsciiArtBlock code={codeString} />;
                  }
                  return <CodeBlock language="text" code={codeString} />;
                }
                return (
                  <code
                    className="mx-0.5 rounded-md px-1.5 py-0.5 font-mono text-[0.82em]"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              pre({ children }) {
                return <>{children}</>;
              },
              blockquote({ children }) {
                return (
                  <blockquote className="my-4 rounded-r-md border-l-[3px] px-4 py-2 italic">
                    {children}
                  </blockquote>
                );
              },
              ul({ children }) {
                return (
                  <ul className="my-3.5 space-y-2 list-disc pl-6">
                    {children}
                  </ul>
                );
              },
              ol({ children }) {
                return (
                  <ol className="my-3.5 space-y-2 list-decimal pl-6">
                    {children}
                  </ol>
                );
              },
              li({ children }) {
                return <li className="pl-0.5 leading-[1.7]">{children}</li>;
              },
              hr() {
                return <hr className="my-6 border-[var(--enterprise-border)]/80" />;
              },
              strong({ children }) {
                return (
                  <strong className="font-semibold">
                    {children}
                  </strong>
                );
              },
              em({ children }) {
                return <em className="italic">{children}</em>;
              },
              table({ children }) {
                return (
                  <div className="my-4 w-full overflow-x-auto rounded-lg border border-border/70 font-chat-sans">
                    <table className="w-full border-collapse text-[13.5px]">
                      {children}
                    </table>
                  </div>
                );
              },
              thead({ children }) {
                return (
                  <thead className="bg-muted/60 text-left">{children}</thead>
                );
              },
              tbody({ children }) {
                return (
                  <tbody className="divide-y divide-border">{children}</tbody>
                );
              },
              tr({ children }) {
                return (
                  <tr className="transition-colors hover:bg-muted/30">
                    {children}
                  </tr>
                );
              },
              th({ children }) {
                return (
                  <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                    {children}
                  </th>
                );
              },
              td({ children }) {
                return <td className="px-4 py-2.5">{children}</td>;
              },
              a({ href, children }) {
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-[var(--chat-accent)]/40 underline-offset-[3px] transition-opacity hover:opacity-80"
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {markdownContent}
          </ReactMarkdown>
          </BlockReviseProvider>
        </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MessageTimestamp iso={message.created_at} align="left" />
          <AnswerActions
            content={displayContent}
            sources={sources}
            disabled={actionsDisabled}
            onOpenDocument={(src) =>
              src.document_id && onOpenSource?.(src, 1)
            }
            onViewSources={() => setSourcesPanelOpen(true)}
          />
        </div>

        <CitationList
          sources={sources}
          activeIndex={activeCitationIndex}
          onOpenSource={onOpenSource}
          open={sourcesPanelOpen}
          onOpenChange={setSourcesPanelOpen}
          onOpenInPanel={() => {
            setSourcesPanelOpen(true);
            const first = sources.find((s) => s.document_id);
            if (first) onOpenSource?.(first, first.source_index ?? 1);
          }}
        />
      </div>
    </div>
  );
}

