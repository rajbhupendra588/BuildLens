"use client";

import { useChatStore } from "@/hooks/use-chat-store";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { ChatMessageItem } from "./chat-message-item";
import { Loader2, SendHorizontal, Square, ChevronDown } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { apiRequest } from "@/lib/api";
import { Message, MODE_LABELS, MODE_ICONS } from "@/types/chat";
import { Skeleton } from "../ui/skeleton";
import { ModelSelector } from "./model-selector";
import { cn } from "@/lib/utils";

export function ChatInterface() {
  const { currentSessionId } = useChatStore();
  const { messages, setMessages, sendMessage, isTyping, stopGeneration } =
    useChatStream();
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [input, setInput] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Refs for scroll management
  const viewportRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // True while the user has manually scrolled up during streaming
  const userScrolledRef = useRef(false);

  // ── Scroll helpers ──────────────────────────────────────────────────────────

  const getViewport = useCallback((): HTMLElement | null => {
    return (
      viewportRef.current?.querySelector("[data-radix-scroll-area-viewport]") ??
      null
    );
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  // Track user scroll position to decide whether to auto-scroll
  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;

    const handleScroll = () => {
      const distFromBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
      const atBottom = distFromBottom < 80;
      userScrolledRef.current = !atBottom;
      setShowScrollBtn(!atBottom);
    };

    vp.addEventListener("scroll", handleScroll, { passive: true });
    return () => vp.removeEventListener("scroll", handleScroll);
  }, [getViewport]);

  // Auto-scroll when messages update, unless user scrolled up
  useEffect(() => {
    if (!userScrolledRef.current) {
      scrollToBottom("smooth");
    }
  }, [messages, scrollToBottom]);

  // ── History loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    setMessages([]);

    async function loadHistory() {
      if (!currentSessionId) return;
      setIsHistoryLoading(true);
      try {
        const rawHistory = await apiRequest<
          (Message & { detected_mode?: string })[]
        >(`/chat/history/${currentSessionId}`);
        // Map snake_case API field to camelCase + look up label/icon
        const history: Message[] = rawHistory.map((m) => ({
          ...m,
          detectedMode: m.detected_mode ?? undefined,
          modeLabel: m.detected_mode ? MODE_LABELS[m.detected_mode] : undefined,
          modeIcon: m.detected_mode ? MODE_ICONS[m.detected_mode] : undefined,
        }));
        setMessages(history);
      } catch (error) {
        console.error("Failed to load history", error);
        setMessages([]);
      } finally {
        setIsHistoryLoading(false);
        // Jump to bottom instantly after loading history
        requestAnimationFrame(() => scrollToBottom("instant"));
      }
    }
    loadHistory();
  }, [currentSessionId, setMessages, scrollToBottom]);

  // ── Send / stop ─────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const msg = input.trim();
    setInput("");
    // Always scroll to bottom when user sends
    userScrolledRef.current = false;
    setShowScrollBtn(false);
    await sendMessage(msg);
  };

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (!currentSessionId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Select a session or start a new chat to begin.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* ── Message area ── */}
      <ScrollArea ref={viewportRef} className="flex-1 min-h-0 pr-4">
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

          {/* Thinking indicator — shown only while waiting for first content chunk */}
          {isTyping &&
            (messages.length === 0 ||
              messages[messages.length - 1].role !== "assistant" ||
              messages[messages.length - 1].content === "") && (
              <div className="px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Thinking…
              </div>
            )}

          {/* Scroll anchor */}
          <div ref={bottomRef} className="h-1" />
        </div>
      </ScrollArea>

      {/* ── Scroll-to-bottom floating button ── */}
      {showScrollBtn && (
        <button
          onClick={() => {
            userScrolledRef.current = false;
            setShowScrollBtn(false);
            scrollToBottom("smooth");
          }}
          className={cn(
            "absolute bottom-[140px] left-1/2 -translate-x-1/2 z-10",
            "flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5",
            "text-xs text-muted-foreground shadow-md",
            "hover:bg-muted transition-colors",
          )}
        >
          <ChevronDown className="size-3.5" />
          Scroll to bottom
        </button>
      )}

      {/* ── Input area ── */}
      <div className="border-t bg-background p-4 shrink-0">
        <div className="flex justify-center mb-2 max-w-3xl mx-auto">
          <ModelSelector />
        </div>

        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <Input
            placeholder="Ask anything about your documents…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isTyping}
            className="flex-1"
          />

          {isTyping ? (
            /* Stop generation button */
            <Button
              size="icon"
              variant="outline"
              onClick={stopGeneration}
              title="Stop generation"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            /* Send button */
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0"
            >
              <SendHorizontal className="size-5" />
            </Button>
          )}
        </div>

        <p className="text-[10px] text-center text-muted-foreground mt-2">
          AI-generated content can be incorrect. Please verify important
          information.
        </p>
      </div>
    </div>
  );
}
