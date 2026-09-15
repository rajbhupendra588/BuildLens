"use client";

import { useChatStore } from "@/hooks/use-chat-store";
import { useChatStream } from "@/hooks/use-chat-stream";
import { SLOW_REASONING_MODELS } from "@/lib/chat-models";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { ChatDayDivider, ChatMessageItem } from "./chat-message-item";
import { isSameCalendarDay } from "@/lib/chat-time";
import { toast } from "sonner";
import { ChatComposer } from "./chat-composer";
import { ChatDocumentPreviewProvider, useChatDocumentPreview } from "./chat-document-preview-context";
import { ChatDocumentWorkspace } from "./chat-document-workspace";
import { ChevronDown } from "lucide-react";
import { ChatLayout } from "@/components/enterprise-chat/chat-layout";
import { ChatHeader } from "@/components/enterprise-chat/chat-header";
import { EmptyState } from "@/components/enterprise-chat/empty-state";
import { RetrievalStatus } from "@/components/enterprise-chat/retrieval-status";
import { ReportViewer } from "@/components/enterprise-chat/report-viewer";
import { isReportMedia } from "@/types/report";
import { AddedContextStrip } from "@/components/enterprise-chat/added-context-strip";
import { UploadStatus } from "@/components/enterprise-chat/upload-status";
import { useDocumentScopeStore } from "@/hooks/use-document-scope-store";
import { scopeLabel } from "@/types/document-scope";
import { apiRequest, logApiError } from "@/lib/api";
import { hydrateChatMessage, HistoryMessage, SourceItem } from "@/types/chat";
import { Skeleton } from "../ui/skeleton";
import {
  chatPanelContentClassName,
  chatPanelOuterClassName,
  chatPanelWidthClassName,
} from "@/lib/chat-panel-layout";
import { cn } from "@/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getActiveChatSessionId } from "@/lib/active-chat-session";
import { ensureChatSession } from "@/lib/ensure-chat-session";
import { collectFilesFromDataTransfer } from "@/lib/collect-dropped-files";
import { buildBlockRevisePrompt } from "@/lib/revise-block-prompt";
import type { BlockReviseRequest } from "@/components/chat/block-revise";
import {
  enqueueDocumentFiles,
} from "@/stores/upload-queue-store";
import {
  validateDocumentFile,
} from "@/lib/document-upload";

function ChatInterfaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { currentSessionId, selectedModel, addSession, setCurrentSessionId } =
    useChatStore();
  const { openFromSource, setPanelSources } =
    useChatDocumentPreview();
  const { scopeId, scopeSuffix } = useDocumentScopeStore();
  const {
    messages,
    setMessages,
    sendMessage,
    rollbackFrom,
    isTyping,
    streamStatus,
    reportScope,
    stopGeneration,
  } = useChatStream();
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [input, setInput] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [attachmentCount, setAttachmentCount] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const pendingQuestionSentRef = useRef<string | null>(null);
  const handleSendRef = useRef<() => void>(() => {});
  const isTypingRef = useRef(isTyping);
  isTypingRef.current = isTyping;

  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;
    if ((pathname === "/" || pathname === "/app") && prev !== "/" && prev !== "/app") {
      setCurrentSessionId(null);
      setMessages([]);
      setAttachmentCount(0);
    }
  }, [pathname, setCurrentSessionId, setMessages]);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    try {
      return await ensureChatSession({
        getCurrentSessionId: () => useChatStore.getState().currentSessionId,
        addSession,
        navigate: (path) => router.push(path),
      });
    } catch (error) {
      logApiError("Create session failed", error);
      return null;
    }
  }, [addSession, router]);

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
    let cancelled = false;

    async function loadHistory() {
      if (!currentSessionId) {
        setMessages([]);
        return;
      }
      setIsHistoryLoading(true);
      try {
        const rawHistory = await apiRequest<HistoryMessage[]>(
          `/chat/history/${currentSessionId}`,
        );
        if (cancelled) return;
        const hydrated = rawHistory.map(hydrateChatMessage);
        // Avoid wiping an in-flight stream when history was fetched before the server saved messages.
        if (hydrated.length === 0 && isTypingRef.current) return;
        setMessages(hydrated);
      } catch (error) {
        if (!cancelled) {
          logApiError("Failed to load history", error);
          if (!isTypingRef.current) setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false);
          requestAnimationFrame(() => scrollToBottom("instant"));
        }
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, setMessages, scrollToBottom]);

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    pendingQuestionSentRef.current = null;
  }, [currentSessionId]);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (!q || !currentSessionId || isHistoryLoading || isTyping) return;
    if (messages.length > 0) return;
    if (pendingQuestionSentRef.current === `${currentSessionId}:${q}`) return;

    pendingQuestionSentRef.current = `${currentSessionId}:${q}`;
    router.replace(`/chat/${currentSessionId}`, { scroll: false });
    userScrolledRef.current = false;
    void sendMessageRef.current(q);
  }, [
    currentSessionId,
    isHistoryLoading,
    isTyping,
    messages.length,
    router,
    searchParams,
  ]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const msg = input.trim();
    setInput("");
    userScrolledRef.current = false;
    setShowScrollBtn(false);

    const sessionId =
      getActiveChatSessionId(pathname) ??
      currentSessionId ??
      (await ensureSession());
    if (!sessionId) return;
    await sendMessage(msg, sessionId);
  };

  handleSendRef.current = () => {
    void handleSend();
  };

  const handleStarterPrompt = (text: string) => {
    setInput(text);
    document.getElementById("chat-composer-input")?.focus();
  };

  const scopeDisplay =
    scopeSuffix != null
      ? `${scopeLabel(scopeId)} · ${scopeSuffix}`
      : scopeLabel(scopeId);

  const handleOpenSource = (source: SourceItem, citationIndex: number) => {
    openFromSource(source, citationIndex);
  };

  useEffect(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && (m.sources?.length ?? 0) > 0);
    if (lastAssistant?.sources) {
      setPanelSources(lastAssistant.sources);
    }
  }, [messages, setPanelSources]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "/") {
        e.preventDefault();
        document.getElementById("chat-composer-input")?.focus();
      }
      if (mod && e.key === "Enter" && document.activeElement?.id === "chat-composer-input") {
        e.preventDefault();
        void handleSendRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleRollback = async (messageId: string) => {
    const sessionId =
      getActiveChatSessionId(pathname) ?? currentSessionId;
    if (!sessionId || isTyping) return;
    try {
      await rollbackFrom(messageId, sessionId);
      toast.success("Conversation restored to that point");
    } catch (error) {
      logApiError("Rollback failed", error);
      toast.error("Could not roll back that message.");
    }
  };

  const handleEdit = async (messageId: string, content: string) => {
    const sessionId =
      getActiveChatSessionId(pathname) ?? currentSessionId;
    if (!sessionId || isTyping) return;
    try {
      await rollbackFrom(messageId, sessionId);
      userScrolledRef.current = false;
      setShowScrollBtn(false);
      await sendMessage(content, sessionId);
    } catch (error) {
      logApiError("Edit message failed", error);
      toast.error("Could not edit that message.");
    }
  };

  const handleReviseBlock = async (request: BlockReviseRequest) => {
    if (isTyping) return;
    const sessionId =
      getActiveChatSessionId(pathname) ??
      currentSessionId ??
      (await ensureSession());
    if (!sessionId) return;
    userScrolledRef.current = false;
    setShowScrollBtn(false);
    await sendMessage(buildBlockRevisePrompt(request), sessionId);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    let files = await collectFilesFromDataTransfer(e.dataTransfer.items);
    if (files.length === 0 && e.dataTransfer.files.length > 0) {
      files = Array.from(e.dataTransfer.files);
    }
    if (files.length === 0) return;

    for (const file of files) {
      const err = validateDocumentFile(file);
      if (err) {
        toast.error(err);
        return;
      }
    }

    const sessionId =
      getActiveChatSessionId(pathname) ?? (await ensureSession());
    if (!sessionId) return;
    enqueueDocumentFiles(files, sessionId);
    toast.message(
      files.length === 1
        ? `Uploading ${files[0].name}…`
        : `Uploading ${files.length} files…`,
    );
  };

  const showEmptyConversation =
    !isHistoryLoading && messages.length === 0 && !isTyping;

  const composerFooter =
    attachmentCount > 0
      ? "Questions search attached files for this conversation."
      : "Without attachments, answers draw from your indexed project library.";

  return (
    <ChatDocumentWorkspace>
      <ChatLayout
        header={
          <ChatHeader
            onOpenSearch={() =>
              document.querySelector<HTMLInputElement>(
                '[placeholder="Search conversations…"]',
              )?.focus()
            }
          />
        }
      >
        <div
          className={cn(
            "flex flex-col flex-1 min-h-0 relative",
            isDragOver && "ring-2 ring-inset ring-[var(--enterprise-accent)]/30",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => void handleDrop(e)}
        >
          <ScrollArea ref={viewportRef} className="flex-1 min-h-0 bg-[var(--enterprise-bg)]">
            <div className={chatPanelOuterClassName()}>
              <div
                className={cn(
                  chatPanelContentClassName("pb-2"),
                  "min-h-full flex flex-col",
                )}
              >
                <div className="flex-1 min-h-0">
                  {currentSessionId && isHistoryLoading ? (
                    <div className="space-y-4 py-4">
                      <Skeleton className="h-12 w-full rounded-md" />
                      <Skeleton className="h-24 w-full rounded-md" />
                    </div>
                  ) : showEmptyConversation ? (
                    <EmptyState onSelectSuggestion={handleStarterPrompt} />
                  ) : (
                    messages.map((msg, index) => {
                      const previous = messages[index - 1];
                      const showDay =
                        !previous ||
                        !isSameCalendarDay(previous.created_at, msg.created_at);
                      return (
                        <Fragment key={msg.id}>
                          {showDay ? (
                            <ChatDayDivider iso={msg.created_at} />
                          ) : null}
                          <ChatMessageItem
                            message={msg}
                            scopeLabel={
                              msg.role === "user" ? scopeDisplay : undefined
                            }
                            reportScopeLabel={
                              msg.role === "user"
                                ? (() => {
                                    const next = messages[index + 1];
                                    const report = next?.media?.find(isReportMedia);
                                    if (report?.document_names?.length === 1) {
                                      return report.document_names[0];
                                    }
                                    if (report?.document_names?.length) {
                                      return `${report.document_names.length} selected documents`;
                                    }
                                    return reportScope ?? scopeDisplay;
                                  })()
                                : undefined
                            }
                            onOpenSource={handleOpenSource}
                            onEdit={handleEdit}
                            onReviseBlock={handleReviseBlock}
                            onRollback={handleRollback}
                            actionsDisabled={isTyping}
                          />
                        </Fragment>
                      );
                    })
                  )}

                  {isTyping &&
                    (messages.length === 0 ||
                      messages[messages.length - 1].role !== "assistant" ||
                      messages[messages.length - 1].content === "") && (
                      <RetrievalStatus
                        statusText={
                          streamStatus ??
                          (SLOW_REASONING_MODELS.has(selectedModel)
                            ? "Analyzing supporting sections…"
                            : attachmentCount > 0
                              ? "Searching attached project files…"
                              : "Searching project documents…")
                        }
                        scopeLabel={reportScope}
                      />
                    )}

                  <div ref={bottomRef} className="h-2" />
                </div>

                <div
                  className={cn(
                    "sticky bottom-0 z-10 -mx-1 px-1 pt-6 pb-4 md:pb-5",
                    "bg-gradient-to-t from-[var(--enterprise-bg)] via-[var(--enterprise-bg)]/95 to-transparent",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl border border-[var(--enterprise-border)]",
                      "bg-[var(--enterprise-surface)]/95 shadow-md shadow-black/25",
                      "ring-1 ring-white/[0.04] p-3 md:p-3.5 space-y-2.5",
                    )}
                  >
                    <UploadStatus />
                    <AddedContextStrip
                      attachmentCount={attachmentCount}
                      onAttachmentCountChange={setAttachmentCount}
                    />
                    <ChatComposer
                      embedded
                      value={input}
                      onChange={setInput}
                      onSend={() => void handleSend()}
                      isTyping={isTyping}
                      onStop={stopGeneration}
                      ensureSession={ensureSession}
                    />
                    <p className="text-[11px] text-muted-foreground leading-relaxed px-0.5">
                      {composerFooter}
                    </p>
                  </div>
                </div>
              </div>
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
                "absolute bottom-[152px] left-1/2 -translate-x-1/2 z-20",
                "flex items-center gap-1.5 rounded-full border border-[var(--enterprise-border)]",
                "bg-[var(--enterprise-surface)] px-3 py-1.5",
                "text-xs text-muted-foreground shadow-md",
                "hover:bg-[var(--enterprise-elevated)] transition-colors",
              )}
            >
              <ChevronDown className="size-3.5" />
              Scroll to bottom
            </button>
          )}
        </div>
      </ChatLayout>
      <ReportViewer />
    </ChatDocumentWorkspace>
  );
}

export function ChatInterface() {
  return (
    <ChatDocumentPreviewProvider>
      <ChatInterfaceInner />
    </ChatDocumentPreviewProvider>
  );
}
