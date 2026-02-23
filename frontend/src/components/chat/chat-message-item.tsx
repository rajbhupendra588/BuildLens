"use client";

import { Message } from "@/types/chat";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ChatMessageItem({ message }: { message: Message }) {
  const isAi = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex w-full items-start gap-4 p-4",
        isAi ? "bg-muted/50" : "bg-background",
      )}
    >
      <Avatar className="size-8 border">
        {isAi ? (
          <>
            <AvatarImage src="/bot-avatar.svg" />
            <AvatarFallback className="bg-primary text-primary-foreground">
              AI
            </AvatarFallback>
          </>
        ) : (
          <>
            <AvatarFallback className="bg-secondary">U</AvatarFallback>
          </>
        )}
      </Avatar>
      <div className="flex-1 space-y-2 overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isAi ? "Assistant" : "You"}
        </p>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
