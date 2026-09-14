"use client";

import { useChatStore } from "@/hooks/use-chat-store";
import { useChatStream } from "@/hooks/use-chat-stream";
import { SLOW_REASONING_MODELS } from "@/lib/chat-models";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { ChatMessageItem } from "./chat-message-item";
import { ChatWorkspaceHeader } from "./chat-workspace-header";
import { SessionAttachmentsBar } from "./session-attachments-bar";
import { ChatComposer } from "./chat-composer";
import {
  Loader2,
  ChevronDown,
  FileText,
  Upload,
  MessageSquarePlus,
  Sparkles,
} from "lucide-react";
import { Button } from "../ui/button";
import { apiRequest, logApiError } from "@/lib/api";
import { ChatSession, Message, MODE_LABELS, MODE_ICONS } from "@/types/chat";
import { Skeleton } from "../ui/skeleton";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

const STARTER_PROMPTS = [
  "Summarize the key points in my uploaded PDF",
  "What are the main risks or obligations mentioned?",
  "List action items with owners and deadlines",
  "Compare sections and highlight contradictions",
];

export function ChatInterface() {
  const router = useRouter();
  const { currentSessionId, selectedModel, addSession } = useChatStore();
  const {
    messages,
    setMessages,
    sendMessage,
    isTyping,
    streamStatus,
    stopGeneration,
  } = useChatStream();
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [input, setInput] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const getViewport = useCallback((): HTMLElement | null => {
    return (
      viewportRef.current?.querySelector("[data-radix-scroll-area-viewport]") ??
      null
    );
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

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

  useEffect(() => {
    if (!userScrolledRef.current) {
      scrollToBottom("smooth");
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    setMessages([]);

    async function loadHistory() {
      if (!currentSessionId) return;
      setIsHistoryLoading(true);
      try {
        const rawHistory = await apiRequest<
          (Message & { detected_mode?: string; media?: Message["media"] })[]
        >(`/chat/history/${currentSessionId}`);
        const history: Message[] = rawHistory.map((m) => ({
          ...m,
          media: m.media ?? [],
          detectedMode: m.detected_mode ?? undefined,
          modeLabel: m.detected_mode ? MODE_LABELS[m.detected_mode] : undefined,
          modeIcon: m.detected_mode ? MODE_ICONS[m.detected_mode] : undefined,
        }));
        setMessages(history);
      } catch (error) {
        logApiError("Failed to load history", error);
        setMessages([]);
      } finally {
        setIsHistoryLoading(false);
        requestAnimationFrame(() => scrollToBottom("instant"));
      }
    }
    loadHistory();
  }, [currentSessionId, setMessages, scrollToBottom]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const msg = input.trim();
    setInput("");
    userScrolledRef.current = false;
    setShowScrollBtn(false);
    await sendMessage(msg);
  };

  const handleStarterPrompt = (text: string) => {
    setInput(text);
  };

  const handleNewConversation = async () => {
    setIsCreatingSession(true);
    try {
      const newSession = await apiRequest<ChatSession>("/chat/sessions", {
        method: "POST",
      });
      addSession(newSession);
      router.push(`/chat/${newSession.id}`);
    } catch (error) {
      logApiError("Create session failed", error);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const showEmptyConversation =
    currentSessionId &&
    !isHistoryLoading &&
    messages.length === 0 &&
    !isTyping;

  if (!currentSessionId) {
    return (
      <div className="flex flex-1 min-h-0 flex-col bg-muted/20">
        <ChatWorkspaceHeader />
        <SessionAttachmentsBar />
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-sm">
            <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="size-6" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Talk to your documents
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              BuildLens is a document intelligence workspace. Upload PDFs to your
              library, then ask questions—every answer is grounded in what you
              indexed, with citations back to the source file.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary font-medium">1.</span>
                Open Library and upload your PDF
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-medium">2.</span>
                Start a new conversation and ask in plain language
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-medium">3.</span>
                Review cited passages under each reply
              </li>
            </ul>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Button
                className="flex-1"
                onClick={handleNewConversation}
                disabled={isCreatingSession}
              >
                {isCreatingSession ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <MessageSquarePlus className="size-4 mr-2" />
                )}
                New conversation
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <Link href="/library">
                  <Upload className="size-4 mr-2" />
                  Open Library
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 relative bg-muted/15">
      <ChatWorkspaceHeader />
      <SessionAttachmentsBar />

      <ScrollArea ref={viewportRef} className="flex-1 min-h-0">
        <div className="flex w-full flex-col py-6 px-4 md:px-8 lg:px-10 xl:px-12">
          {isHistoryLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-16 w-2/3 ml-auto rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : showEmptyConversation ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
                <Sparkles className="size-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">
                Ready when your PDF is indexed
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
                Ask anything about material in your Library. Responses
                pull from uploaded files only—you will see source cards with file
                name and page where available.
              </p>
              <Button variant="outline" size="sm" className="mt-5" asChild>
                <Link href="/library">
                  <Upload className="size-3.5 mr-2" />
                  Add or manage documents
                </Link>
              </Button>
              <div className="mt-8 w-full text-left">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Try asking
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleStarterPrompt(prompt)}
                      className={cn(
                        "rounded-lg border bg-card px-3 py-2.5 text-left text-sm",
                        "text-foreground/90 transition-colors hover:border-primary/40 hover:bg-primary/5",
                      )}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <ChatMessageItem key={msg.id} message={msg} />
            ))
          )}

          {isTyping &&
            (messages.length === 0 ||
              messages[messages.length - 1].role !== "assistant" ||
              messages[messages.length - 1].content === "") && (
              <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="size-4 animate-spin shrink-0 text-primary" />
                {streamStatus ??
                  (SLOW_REASONING_MODELS.has(selectedModel)
                    ? "Analyzing your documents—first reply may take 1–2 minutes…"
                    : "Searching your document library…")}
              </div>
            )}

          <div ref={bottomRef} className="h-1" />
        </div>
      </ScrollArea>

      {showScrollBtn && (
        <button
          onClick={() => {
            userScrolledRef.current = false;
            setShowScrollBtn(false);
            scrollToBottom("smooth");
          }}
          className={cn(
            "absolute bottom-[168px] left-1/2 -translate-x-1/2 z-10",
            "flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5",
            "text-xs text-muted-foreground shadow-md",
            "hover:bg-muted transition-colors",
          )}
        >
          <ChevronDown className="size-3.5" />
          Scroll to bottom
        </button>
      )}

      <div className="shrink-0 border-t bg-card/90 backdrop-blur-sm p-4 md:p-5">
        <div className="w-full px-4 md:px-8 lg:px-10 xl:px-12">
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={handleSend}
            isTyping={isTyping}
            onStop={stopGeneration}
          />

          <p className="mt-2.5 text-center text-[11px] text-muted-foreground leading-relaxed">
            Attach PDFs with the clip · Voice input uses your browser (Chrome /
            Edge recommended) · Answers cite your document library
          </p>
        </div>
      </div>
    </div>
  );
}
