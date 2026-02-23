"use client";

import { Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

export function ChatMessageItem({ message }: { message: Message }) {
  if (!message || !message.content) return null;

  const isAi = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex w-full gap-3 px-4 py-4",
        isAi ? "justify-start" : "justify-end",
      )}
    >
      {/* AI avatar — left side only */}
      {isAi && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-1">
          <Sparkles className="size-3.5" />
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          "prose prose-sm dark:prose-invert max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
          isAi
            ? "bg-muted text-foreground rounded-tl-sm"
            : "bg-primary text-primary-foreground rounded-tr-sm prose-invert",
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ node, inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || "");
              return !inline && match ? (
                <div className="relative my-2 group">
                  <div className="absolute right-2 top-2 text-[10px] font-mono text-white/40 group-hover:text-white/70 transition-colors uppercase">
                    {match[1]}
                  </div>
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: "0.5rem",
                      fontSize: "0.8rem",
                    }}
                    {...props}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                </div>
              ) : (
                <code
                  className={cn("bg-black/10 rounded px-1", className)}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            table({ children }) {
              return (
                <div className="overflow-x-auto my-4 border rounded-lg">
                  <table className="min-w-full divide-y divide-border m-0">
                    {children}
                  </table>
                </div>
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
