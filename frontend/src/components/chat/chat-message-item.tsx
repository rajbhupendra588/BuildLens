"use client";

import { useState, useCallback } from "react";
import { Message, SourceItem } from "@/types/chat";
import { cn } from "@/lib/utils";
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
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

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
    "py","pyw","js","jsx","mjs","ts","tsx","java","kt","go","rs",
    "c","h","cpp","rb","php","swift","dart","sh","sql","r","scala",
    "html","htm","css","scss","yaml","yml","toml","xml","lua","tf",
  ]);
  const sheetExts = new Set(["csv","xlsx","xls"]);
  const imageExts = new Set(["png","jpg","jpeg","gif","webp","svg"]);

  if (imageExts.has(ext)) return <Image className="size-3.5 text-emerald-500 shrink-0" />;
  if (sheetExts.has(ext)) return <FileSpreadsheet className="size-3.5 text-green-600 shrink-0" />;
  if (codeExts.has(ext)) return <FileCode className="size-3.5 text-violet-500 shrink-0" />;
  if (ext === "pdf") return <FileText className="size-3.5 text-red-500 shrink-0" />;
  if (["doc","docx","pptx","txt","md"].includes(ext))
    return <FileText className="size-3.5 text-blue-500 shrink-0" />;
  return <File className="size-3.5 text-muted-foreground shrink-0" />;
}

function scoreColor(score: number) {
  if (score >= 0.75) return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800";
  if (score >= 0.5) return "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800";
  return "text-muted-foreground bg-muted border-border";
}

function SourceCard({ source }: { source: SourceItem }) {
  const [expanded, setExpanded] = useState(false);

  const meta: string[] = [];
  if (source.page_number) meta.push(`Page ${source.page_number}`);
  if (source.section_title) meta.push(source.section_title);
  if (source.language) meta.push(source.language);

  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs flex flex-col gap-1.5 hover:bg-muted/50 transition-colors">
      {/* File name + score */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {getFileIcon(source.file_name)}
          <span className="font-medium truncate">{source.file_name}</span>
        </div>
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

function SourceCards({ sources }: { sources: SourceItem[] }) {
  const [showAll, setShowAll] = useState(false);

  if (!sources || sources.length === 0) return null;

  const visible = showAll ? sources : sources.slice(0, INITIAL_VISIBLE);
  const hidden = sources.length - INITIAL_VISIBLE;

  return (
    <div className="mt-4 pt-3 border-t border-border/60">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground font-medium">
        <BookOpen className="size-3.5" />
        {sources.length === 1
          ? "1 source"
          : `${sources.length} sources`}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((src, i) => (
          <SourceCard key={i} source={src} />
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

// ---------------------------------------------------------------------------
// ChatMessageItem
// ---------------------------------------------------------------------------
export function ChatMessageItem({ message }: { message: Message }) {
  if (!message || (!message.content && !message.sources?.length)) return null;

  const isAi = message.role === "assistant";

  // User message
  if (!isAi) {
    return (
      <div className="flex w-full justify-end px-4 py-2">
        <div className="max-w-[70%] min-w-0 rounded-3xl bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className="flex w-full gap-3 px-4 py-4">
      {/* Avatar */}
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
        <Sparkles className="size-3.5" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 max-w-3xl">
        <div className="text-sm leading-7 text-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p({ children }) {
                return <p className="mb-3 last:mb-0 leading-7">{children}</p>;
              },
              h1({ children }) {
                return (
                  <h1 className="mt-6 mb-3 text-xl font-bold first:mt-0 border-b border-border pb-2">
                    {children}
                  </h1>
                );
              },
              h2({ children }) {
                return (
                  <h2 className="mt-5 mb-2 text-lg font-semibold first:mt-0">
                    {children}
                  </h2>
                );
              },
              h3({ children }) {
                return (
                  <h3 className="mt-4 mb-1.5 text-base font-semibold first:mt-0">
                    {children}
                  </h3>
                );
              },
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "");
                const codeString = String(children).replace(/\n$/, "");
                if (!inline && match) {
                  return <CodeBlock language={match[1]} code={codeString} />;
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
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Source citation cards */}
        <SourceCards sources={message.sources ?? []} />
      </div>
    </div>
  );
}
