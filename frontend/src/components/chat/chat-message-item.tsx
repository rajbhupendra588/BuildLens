"use client";

import { Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles } from "lucide-react";

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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
