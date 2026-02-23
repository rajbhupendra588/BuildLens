"use client";

import { useChatStore } from "@/hooks/use-chat-store";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { ChatMessageItem } from "./chat-message-item";
import { Loader2, SendHorizontal } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiRequest } from "@/lib/api";
import { Message } from "@/types/chat";
import { Skeleton } from "../ui/skeleton";

export function ChatInterface() {
  const { currentSessionId } = useChatStore();
  const { messages, setMessages, sendMessage, isTyping } = useChatStream();
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [messages]);

  // Load chat history when session changes
  useEffect(() => {
    // Clear stale messages immediately so we don't flash old content
    setMessages([]);

    async function loadHistory() {
      if (!currentSessionId) return;
      setIsHistoryLoading(true);
      try {
        const history = await apiRequest<Message[]>(
          `/chat/history/${currentSessionId}`,
        );
        setMessages(history);
      } catch (error) {
        console.error("Failed to load history", error);
        setMessages([]);
      } finally {
        setIsHistoryLoading(false);
      }
    }
    loadHistory();
  }, [currentSessionId, setMessages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const msg = input;
    setInput("");
    await sendMessage(msg);
  };

  if (!currentSessionId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a session or start a new chat to begin.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Message Area */}
      <ScrollArea ref={scrollRef} className="flex-1 pr-4">
        <div className="flex flex-col py-4">
          {isHistoryLoading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-3/4" />
            </div>
          ) : (
            messages.map((msg) => (
              <ChatMessageItem key={msg.id} message={msg} />
            ))
          )}
          {isTyping &&
            messages.length > 0 &&
            messages[messages.length - 1].role !== "assistant" && (
              <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                AI is thinking...
              </div>
            )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t bg-background p-4 sticky bottom-0">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <Input
            placeholder="Ask anything about your documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={isTyping}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={isTyping || !input.trim()}
          >
            {isTyping ? (
              <Loader2 className="animate-spin" />
            ) : (
              <SendHorizontal className="size-5" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-center text-muted-foreground mt-2">
          AI-generated content can be incorrect. Please verify important
          information.
        </p>
      </div>
    </div>
  );
}
