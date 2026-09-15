"use client";

import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Message, SourceItem } from "@/types/chat";
import { MessageMediaGallery } from "./message-media-gallery";
import { documentFileUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  formatChatDay,
  formatChatDateTime,
  formatChatStamp,
} from "@/lib/chat-time";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles,
  Copy,
  Check,
  Code2,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image,
  File,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Pencil,
  Undo2,
} from "lucide-react";
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

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const codeExts = new Set([
    "py",
    "pyw",
    "js",
    "jsx",
    "mjs",
    "ts",
    "tsx",
    "java",
    "kt",
    "go",
    "rs",
    "c",
    "h",
    "cpp",
    "rb",
    "php",
    "swift",
    "dart",
    "sh",
    "sql",
    "r",
    "scala",
    "html",
    "htm",
    "css",
    "scss",
    "yaml",
    "yml",
    "toml",
    "xml",
    "lua",
    "tf",
  ]);
  const sheetExts = new Set(["csv", "xlsx", "xls"]);
  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

  if (imageExts.has(ext))
    return <Image className="size-3.5 text-emerald-500 shrink-0" />;
  if (sheetExts.has(ext))
    return <FileSpreadsheet className="size-3.5 text-green-600 shrink-0" />;
  if (codeExts.has(ext))
    return <FileCode className="size-3.5 text-violet-500 shrink-0" />;
  if (ext === "pdf")
    return <FileText className="size-3.5 text-red-500 shrink-0" />;
  if (["doc", "docx", "pptx", "txt", "md"].includes(ext))
    return <FileText className="size-3.5 text-blue-500 shrink-0" />;
  return <File className="size-3.5 text-muted-foreground shrink-0" />;
}

function scoreColor(score: number) {
  if (score >= 0.75)
    return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800";
  if (score >= 0.5)
    return "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800";
  return "text-muted-foreground bg-muted border-border";
}

function SourceCard({
  source,
  onOpen,
}: {
  source: SourceItem;
  onOpen?: (source: SourceItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const imagePreview =
    source.is_image && source.document_id
      ? documentFileUrl(source.document_id)
      : null;

  const meta: string[] = [];
  if (source.page_number) meta.push(`Page ${source.page_number}`);
  if (source.section_title) meta.push(source.section_title);
  if (source.language) meta.push(source.language);

  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs flex flex-col gap-1.5 hover:bg-muted/50 transition-colors">
      {/* File name + score */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-primary"
          disabled={!source.document_id || !onOpen}
          onClick={() => source.document_id && onOpen?.(source)}
        >
          {getFileIcon(source.file_name)}
          <span className="font-medium truncate">{source.file_name}</span>
        </button>
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-semibold",
            scoreColor(source.score),
          )}
        >
          {(source.score * 100).toFixed(0)}%
        </span>
      </div>

      {/* Page / section / language */}
      {meta.length > 0 && (
        <p className="text-muted-foreground truncate">{meta.join(" · ")}</p>
      )}

      {imagePreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagePreview}
          alt={source.file_name}
          className="mt-1 max-h-32 w-full rounded-md border object-contain bg-muted/50"
          loading="lazy"
        />
      ) : null}

      {/* Snippet */}
      {source.snippet && (
        <div>
          <p
            className={cn(
              "text-muted-foreground leading-relaxed",
              !expanded && "line-clamp-2",
            )}
          >
            {source.snippet}
          </p>
          {source.snippet.length > 120 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-primary/70 hover:text-primary flex items-center gap-0.5 transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="size-3" />
                  Less
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" />
                  More
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourceCards — collapsible list below AI answer
// ---------------------------------------------------------------------------
const INITIAL_VISIBLE = 3;

function SourceCards({
  sources,
  onOpenSource,
}: {
  sources: SourceItem[];
  onOpenSource?: (source: SourceItem) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (!sources || sources.length === 0) return null;

  const visible = showAll ? sources : sources.slice(0, INITIAL_VISIBLE);
  const hidden = sources.length - INITIAL_VISIBLE;

  return (
    <div className="mt-4 pt-3 border-t border-border/60">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground font-medium">
        <BookOpen className="size-3.5" />
        {sources.length === 1 ? "1 source" : `${sources.length} sources`}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((src, i) => (
          <SourceCard key={i} source={src} onOpen={onOpenSource} />
        ))}
      </div>

      {hidden > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUp className="size-3" />
              Show fewer sources
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              Show {hidden} more source{hidden > 1 ? "s" : ""}
            </>
          )}
        </button>
      )}
    </div>
  );
}

function MessageTimestamp({ iso, align }: { iso: string; align: "left" | "right" }) {
  const stamp = formatChatStamp(iso);
  if (!stamp) return null;
  return (
    <time
      dateTime={iso}
      title={formatChatDateTime(iso)}
      className={cn(
        "text-[11px] text-muted-foreground tabular-nums",
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
      <span className="shrink-0 rounded-full border bg-card px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
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
      <Tag className={cn(className, "pr-2")}>{children}</Tag>
    </EditableBlockFrame>
  );
}

export function ChatMessageItem({
  message,
  onOpenSource,
  onEdit,
  onReviseBlock,
  onRollback,
  actionsDisabled,
}: {
  message: Message;
  onOpenSource?: (source: SourceItem) => void;
  onEdit?: (messageId: string, content: string) => void | Promise<void>;
  onReviseBlock?: (request: BlockReviseRequest) => void | Promise<void>;
  onRollback?: (messageId: string) => void | Promise<void>;
  actionsDisabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
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
      <div className="group/msg flex w-full justify-end py-2">
        <div className="flex max-w-[min(720px,85%)] min-w-0 flex-col items-end gap-1">
          {isEditing ? (
            <div className="w-full min-w-[min(280px,85vw)] rounded-2xl rounded-br-md border bg-card p-3 shadow-sm">
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
                className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void saveEdit()}
                  disabled={isSaving || !draft.trim()}
                >
                  Save & submit
                </Button>
              </div>
            </div>
          ) : (
            <div className="w-full min-w-0 rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm whitespace-pre-wrap">
              {message.content}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <MessageTimestamp iso={message.created_at} align="right" />
            {!isEditing ? actionBar : null}
          </div>
        </div>
        {rollbackDialog}
      </div>
    );
  }

  const markdownContent = wrapAsciiArtBlocksInMarkdown(message.content ?? "");

  // AI message
  return (
    <div className="group/msg flex w-full gap-3 py-4">
      {rollbackDialog}
      <div className="flex flex-col items-center gap-1.5 shrink-0 mt-0.5">
        <div className="flex size-8 items-center justify-center rounded-lg border bg-card text-primary shadow-sm">
          <Sparkles className="size-4" />
        </div>
        {/* {message.detectedMode && message.modeLabel && message.modeIcon && (
          <ModeBadge
            mode={message.detectedMode}
            label={message.modeLabel}
            icon={message.modeIcon}
          />
        )} */}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="rounded-xl border bg-card px-4 py-3 text-sm leading-7 text-foreground shadow-sm">
          <MessageMediaGallery media={message.media ?? []} />
          <BlockReviseProvider
            disabled={actionsDisabled}
            onSubmit={onReviseBlock}
          >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p({ children }) {
                return <p className="mb-3 last:mb-0 leading-7">{children}</p>;
              },
              h1({ children }) {
                return (
                  <MarkdownHeading
                    as="h1"
                    className="mt-6 mb-3 text-xl font-bold first:mt-0 border-b border-border pb-2"
                  >
                    {children}
                  </MarkdownHeading>
                );
              },
              h2({ children }) {
                return (
                  <MarkdownHeading
                    as="h2"
                    className="mt-5 mb-2 text-lg font-semibold first:mt-0"
                  >
                    {children}
                  </MarkdownHeading>
                );
              },
              h3({ children }) {
                return (
                  <MarkdownHeading
                    as="h3"
                    className="mt-4 mb-1.5 text-base font-semibold first:mt-0"
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
                    (lang === "json" && looksLikeInfographicJson(codeString))
                  ) {
                    return <InfographicBlock rawJson={codeString} />;
                  }
                  return <CodeBlock language={match[1]} code={codeString} />;
                }
                if (!inline && !match && codeString.includes("\n")) {
                  if (looksLikeAsciiArt(codeString)) {
                    return <AsciiArtBlock code={codeString} />;
                  }
                  return <CodeBlock language="text" code={codeString} />;
                }
                return (
                  <code
                    className="mx-0.5 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.8em] text-foreground"
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
                  <blockquote className="my-3 border-l-[3px] border-border pl-4 text-muted-foreground italic">
                    {children}
                  </blockquote>
                );
              },
              ul({ children }) {
                return (
                  <ul className="my-3 space-y-1.5 list-disc pl-6">
                    {children}
                  </ul>
                );
              },
              ol({ children }) {
                return (
                  <ol className="my-3 space-y-1.5 list-decimal pl-6">
                    {children}
                  </ol>
                );
              },
              li({ children }) {
                return <li className="leading-7 pl-0.5">{children}</li>;
              },
              hr() {
                return <hr className="my-4 border-border" />;
              },
              strong({ children }) {
                return (
                  <strong className="font-semibold text-foreground">
                    {children}
                  </strong>
                );
              },
              em({ children }) {
                return <em className="italic">{children}</em>;
              },
              table({ children }) {
                return (
                  <div className="my-4 w-full overflow-x-auto rounded-lg border border-border">
                    <table className="w-full border-collapse text-sm">
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
                    className="text-primary underline underline-offset-4 transition-opacity hover:opacity-70"
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

        <div className="mt-1.5 flex items-center gap-1.5">
          <MessageTimestamp iso={message.created_at} align="left" />
          {actionBar}
        </div>

        {/* Source citation cards */}
        <SourceCards
          sources={message.sources ?? []}
          onOpenSource={onOpenSource}
        />
      </div>
    </div>
  );
}
