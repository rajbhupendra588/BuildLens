"use client";

import { useState, useCallback } from "react";
import { Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, Copy, Check, Code2 } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

// ---------------------------------------------------------------------------
// CodeBlock — ChatGPT-style: </> icon + title-case lang, icon-only copy btn
// ---------------------------------------------------------------------------
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied — silently fail
    }
  }, [code]);

  // "python" → "Python", "typescript" → "TypeScript" best-effort
  const displayLang =
    language.length <= 3
      ? language.toUpperCase()           // js → JS, css → CSS, sql → SQL
      : language.charAt(0).toUpperCase() + language.slice(1); // python → Python

  return (
    <div className="my-4 w-full rounded-xl overflow-hidden bg-[#1e1e1e] text-sm">
      {/* ── Header ── */}
      <div className="flex items-center justify-between pl-4 pr-2 py-2.5 bg-[#2a2a2a]">
        {/* Left: </> icon + language name */}
        <div className="flex items-center gap-2 text-white/60">
          <Code2 className="size-3.5 shrink-0" />
          <span className="font-sans text-xs font-medium">{displayLang}</span>
        </div>

        {/* Right: icon-only copy button */}
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

      {/* ── Code ── */}
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
          style: { fontFamily: "var(--font-geist-mono, 'Fira Code', monospace)" },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatMessageItem — ChatGPT layout
// ---------------------------------------------------------------------------
export function ChatMessageItem({ message }: { message: Message }) {
  if (!message || !message.content) return null;

  const isAi = message.role === "assistant";

  // ── User message — dark rounded pill, right-aligned ──────────────────────
  if (!isAi) {
    return (
      <div className="flex w-full justify-end px-4 py-2">
        <div className="max-w-[70%] min-w-0 rounded-3xl bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  // ── AI message — no bubble, full-width prose area ─────────────────────────
  return (
    <div className="flex w-full gap-3 px-4 py-4">
      {/* Avatar */}
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
        <Sparkles className="size-3.5" />
      </div>

      {/* Content area — full width, no background */}
      <div className="min-w-0 flex-1 max-w-3xl text-sm leading-7 text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // ── Paragraphs ────────────────────────────────────────────────
            p({ children }) {
              return <p className="mb-3 last:mb-0 leading-7">{children}</p>;
            },

            // ── Headings ──────────────────────────────────────────────────
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

            // ── Code (inline + block) ─────────────────────────────────────
            code({ node, inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || "");
              const codeString = String(children).replace(/\n$/, "");

              if (!inline && match) {
                return <CodeBlock language={match[1]} code={codeString} />;
              }

              // Inline code
              return (
                <code
                  className="mx-0.5 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.8em] text-foreground"
                  {...props}
                >
                  {children}
                </code>
              );
            },

            // ── Pre wrapper — CodeBlock handles all styling ───────────────
            pre({ children }) {
              return <>{children}</>;
            },

            // ── Blockquote ────────────────────────────────────────────────
            blockquote({ children }) {
              return (
                <blockquote className="my-3 border-l-[3px] border-border pl-4 text-muted-foreground italic">
                  {children}
                </blockquote>
              );
            },

            // ── Lists ─────────────────────────────────────────────────────
            ul({ children }) {
              return (
                <ul className="my-3 space-y-1.5 list-disc pl-6">{children}</ul>
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

            // ── Horizontal rule ───────────────────────────────────────────
            hr() {
              return <hr className="my-4 border-border" />;
            },

            // ── Strong / em ───────────────────────────────────────────────
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

            // ── Table ─────────────────────────────────────────────────────
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

            // ── Links ─────────────────────────────────────────────────────
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
    </div>
  );
}
