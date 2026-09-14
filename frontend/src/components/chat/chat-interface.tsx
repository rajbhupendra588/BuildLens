"use client";

import { useChatStore } from "@/hooks/use-chat-store";
import { useChatStream } from "@/hooks/use-chat-stream";
import { SLOW_REASONING_MODELS } from "@/lib/chat-models";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { ChatDayDivider, ChatMessageItem } from "./chat-message-item";
import { isSameCalendarDay } from "@/lib/chat-time";
import { toast } from "sonner";
import { ChatWorkspaceHeader } from "./chat-workspace-header";
import { ChatComposer } from "./chat-composer";
import { ChatDocumentPreviewProvider, useChatDocumentPreview } from "./chat-document-preview-context";
import { ChatDocumentWorkspace } from "./chat-document-workspace";
import { Loader2, ChevronDown, Sparkles } from "lucide-react";
import { apiRequest, logApiError } from "@/lib/api";
import { hydrateChatMessage, HistoryMessage, SourceItem } from "@/types/chat";
import { Skeleton } from "../ui/skeleton";
import { cn } from "@/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getActiveChatSessionId } from "@/lib/active-chat-session";
import { ensureChatSession } from "@/lib/ensure-chat-session";
import { collectFilesFromDataTransfer } from "@/lib/collect-dropped-files";
import {
  enqueueDocumentFiles,
} from "@/stores/upload-queue-store";
import {
  validateDocumentFile,
} from "@/lib/document-upload";
import {
  CHAT_SLASH_COMMANDS,
  slashForCommand,
} from "@/lib/chat-slash-commands";

const STARTER_PROMPTS = [
  ...CHAT_SLASH_COMMANDS.map((c) => slashForCommand(c.name)),
  "Summarize the key points in my document",
  "What are the main risks or obligations mentioned?",
  "List action items with owners and deadlines",
];

function ChatInterfaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { currentSessionId, selectedModel, addSession, setCurrentSessionId } =
    useChatStore();
  const { openPreview } = useChatDocumentPreview();
  const {
    messages,
    setMessages,
    sendMessage,
    rollbackFrom,
    isTyping,
    streamStatus,
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

  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;
    if (pathname === "/" && prev !== "/") {
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
    setMessages([]);

    async function loadHistory() {
      if (!currentSessionId) return;
      setIsHistoryLoading(true);
      try {
        const rawHistory = await apiRequest<HistoryMessage[]>(
          `/chat/history/${currentSessionId}`,
        );
        setMessages(rawHistory.map(hydrateChatMessage));
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

  const handleStarterPrompt = (text: string) => {
    setInput(text);
  };

  const handleOpenSource = (source: SourceItem) => {
    if (!source.document_id) return;
    openPreview({
      documentId: source.document_id,
      fileName: source.file_name,
      pageNumber: source.page_number,
    });
  };

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
      ? "This chat searches attached files only · Clip or folder icon to add more"
      : "Attach files with the clip or pick from library · Without attachments, answers use your full library";

  return (
    <ChatDocumentWorkspace>
      <div
        className={cn(
          "flex flex-col flex-1 min-h-0 relative bg-background",
          isDragOver && "ring-2 ring-inset ring-primary/30",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => void handleDrop(e)}
      >
        <ChatWorkspaceHeader />

        <ScrollArea ref={viewportRef} className="flex-1 min-h-0">
          <div className="mx-auto flex w-full max-w-3xl flex-col py-6 px-4 md:px-6">
            {currentSessionId && isHistoryLoading ? (
              <div className="space-y-4 py-4">
                <Skeleton className="h-16 w-2/3 ml-auto rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : showEmptyConversation ? (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
                  <Sparkles className="size-7 text-primary" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {currentSessionId
                    ? attachmentCount > 0
                      ? "Ask about your attached files"
                      : "How can I help with your documents?"
                    : "Chat with your documents"}
                </h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
                  {currentSessionId && attachmentCount > 0
                    ? "Questions in this thread use only the files attached below."
                    : "Drop a file here, use the clip to upload, or ask about your library."}
                </p>
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
              messages.map((msg, index) => {
                const previous = messages[index - 1];
                const showDay =
                  !previous ||
                  !isSameCalendarDay(previous.created_at, msg.created_at);
                return (
                  <Fragment key={msg.id}>
                    {showDay ? <ChatDayDivider iso={msg.created_at} /> : null}
                    <ChatMessageItem
                      message={msg}
                      onOpenSource={handleOpenSource}
                      onEdit={handleEdit}
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
                <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                  <Loader2 className="size-4 animate-spin shrink-0 text-primary" />
                  {streamStatus ??
                    (SLOW_REASONING_MODELS.has(selectedModel)
                      ? "Analyzing your documents—first reply may take 1–2 minutes…"
                      : attachmentCount > 0
                        ? "Searching attached files…"
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
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={() => void handleSend()}
            isTyping={isTyping}
            onStop={stopGeneration}
            ensureSession={ensureSession}
            onAttachmentCountChange={setAttachmentCount}
          />

          <p className="mt-2.5 text-center text-[11px] text-muted-foreground leading-relaxed max-w-3xl mx-auto">
            {composerFooter}
          </p>
        </div>
      </div>
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
