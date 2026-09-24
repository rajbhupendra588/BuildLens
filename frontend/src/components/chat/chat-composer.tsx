"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_ACCEPT,
  MAX_SESSION_ATTACHMENTS,
  validateDocumentFile,
} from "@/lib/document-upload";
import { apiRequest } from "@/lib/api";
import {
  enqueueDocumentFiles,
  useUploadQueueStore,
} from "@/stores/upload-queue-store";
import { useActiveChatSessionId } from "@/lib/active-chat-session";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { toast } from "sonner";
import { SlashCommandMenu } from "./slash-command-menu";
import { ChatToolsMenu } from "./chat-tools-menu";
import { useChatDocumentPreview } from "./chat-document-preview-context";
import { UploadTransferProgress } from "@/components/upload-transfer-progress";
import {
  FolderOpen,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  SendHorizontal,
  Square,
  X,
} from "lucide-react";
import { useDocumentScopeStore } from "@/hooks/use-document-scope-store";
import { fileMatchesScope } from "@/types/document-scope";
import { libraryDocIsIndexed } from "@/lib/library-document-utils";
import type { LibraryDocument } from "@/types/document";
import {
  applySlashCommandSelection,
  filterSlashCommands,
  getSlashCommandFilter,
  isSlashCommandMenuOpen,
  type ChatSlashCommand,
} from "@/lib/chat-slash-commands";
import { ComposerAttachments } from "./composer-attachments";
import { DocumentScopeSelector } from "@/components/enterprise-chat/document-scope-selector";
import { useReportStore } from "@/hooks/use-report-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface LibraryDocRow {
  document_id: string;
  file_name: string;
  collection?: string;
}

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isTyping: boolean;
  onStop: () => void;
  disabled?: boolean;
  ensureSession?: () => Promise<string | null>;
  onAttachmentCountChange?: (count: number) => void;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  isTyping,
  onStop,
  disabled,
  ensureSession,
  onAttachmentCountChange,
}: ChatComposerProps) {
  const activeSessionId = useActiveChatSessionId();
  const scopeId = useDocumentScopeStore((s) => s.scopeId);
  const activeReportId = useReportStore((s) => s.activeReportId);
  const activeReportTitle = useReportStore((s) => s.activeReportTitle);
  const clearActiveReport = useReportStore((s) => s.clearActiveReport);
  const { openPreview } = useChatDocumentPreview();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadQueue = useUploadQueueStore((s) => s.uploadQueue);
  const [libraryDocs, setLibraryDocs] = useState<LibraryDocRow[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);

  /** Block input only until this chat can use the file (not during background library index). */
  const activeUpload = uploadQueue.find(
    (i) =>
      (!activeSessionId || i.sessionId === activeSessionId) &&
      (i.status === "pending" ||
        i.status === "uploading" ||
        (i.status === "processing" && !i.chatReady)),
  );

  const slashMenuOpen =
    !isTyping && !activeUpload && !disabled && isSlashCommandMenuOpen(value);
  const scopedLibraryDocs = useMemo(() => {
    if (scopeId === "all") return libraryDocs;
    return libraryDocs.filter(
      (doc) =>
        fileMatchesScope(doc.file_name, scopeId) ||
        doc.collection === scopeId,
    );
  }, [libraryDocs, scopeId]);

  const slashFilter = getSlashCommandFilter(value);
  const slashCommands = useMemo(
    () => filterSlashCommands(slashFilter),
    [slashFilter],
  );

  useEffect(() => {
    setSlashActiveIndex(0);
  }, [slashFilter, slashMenuOpen]);

  useEffect(() => {
    if (slashActiveIndex >= slashCommands.length && slashCommands.length > 0) {
      setSlashActiveIndex(slashCommands.length - 1);
    }
  }, [slashActiveIndex, slashCommands.length]);

  const selectSlashCommand = useCallback(
    (cmd: ChatSlashCommand) => {
      onChange(applySlashCommandSelection(cmd));
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [onChange],
  );

  const voice = useVoiceInput({
    onInterim: (text) => onChange(text),
    onFinal: (text) => onChange(text),
  });

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await apiRequest<{ documents: LibraryDocRow[] }>(
        "/documents/",
      );
      setLibraryDocs(
        (res.documents ?? []).filter((doc) =>
          libraryDocIsIndexed(doc as LibraryDocument),
        ),
      );
    } catch {
      setLibraryDocs([]);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
    const onDocs = () => void loadLibrary();
    window.addEventListener("buildlens:documents-changed", onDocs);
    return () => window.removeEventListener("buildlens:documents-changed", onDocs);
  }, [loadLibrary]);

  const resolveSessionId = async (): Promise<string | null> => {
    if (activeSessionId) return activeSessionId;
    if (!ensureSession) return null;
    return ensureSession();
  };

  const checkAttachmentSlots = async (
    sessionId: string,
    incomingCount: number,
  ): Promise<number | null> => {
    try {
      const attachments = await apiRequest<{ id: string }[]>(
        `/chat/sessions/${sessionId}/attachments`,
      );
      const slots = MAX_SESSION_ATTACHMENTS - attachments.length;
      if (slots <= 0) {
        toast.error(
          `Maximum ${MAX_SESSION_ATTACHMENTS} files per conversation. Remove a file before adding another.`,
        );
        return null;
      }
      if (incomingCount > slots) {
        toast.message(
          `Only ${slots} more file${slots === 1 ? "" : "s"} can be added to this chat.`,
        );
        return slots;
      }
      return incomingCount;
    } catch {
      toast.error("Could not verify attachment limit. Try again.");
      return null;
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    for (const file of list) {
      const validationError = validateDocumentFile(file);
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }

    const sessionId = await resolveSessionId();
    if (!sessionId) {
      toast.error("Start or select a conversation before uploading.");
      return;
    }

    const allowed = await checkAttachmentSlots(sessionId, list.length);
    if (allowed === null) return;

    const toUpload = list.slice(0, allowed);
    enqueueDocumentFiles(toUpload, sessionId);
    toast.message(
      toUpload.length === 1
        ? `Uploading ${toUpload[0].name} — you can chat as soon as preview is ready`
        : `Uploading ${toUpload.length} files for this conversation…`,
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const attachFromLibrary = async (doc: LibraryDocRow) => {
    const sessionId = await resolveSessionId();
    if (!sessionId) {
      toast.error("Start or select a conversation first.");
      return;
    }
    const allowed = await checkAttachmentSlots(sessionId, 1);
    if (allowed === null) return;

    try {
      await apiRequest(`/chat/sessions/${sessionId}/attachments`, {
        method: "POST",
        body: JSON.stringify({ document_id: doc.document_id }),
      });
      window.dispatchEvent(
        new CustomEvent("buildlens:session-attachments-changed"),
      );
      openPreview({
        documentId: doc.document_id,
        fileName: doc.file_name,
      });
      toast.success(`Added ${doc.file_name} to this chat`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not attach file from library";
      toast.error(msg);
    }
  };

  const [localAttachmentCount, setLocalAttachmentCount] = useState(0);

  const handleAttachmentsChange = useCallback(
    (count: number) => {
      setLocalAttachmentCount(count);
      onAttachmentCountChange?.(count);
    },
    [onAttachmentCountChange],
  );

  const hasContextRow =
    Boolean(activeReportId) ||
    scopeId !== "all" ||
    Boolean(activeUpload) ||
    localAttachmentCount > 0;

  const iconBtnClass =
    "size-7 shrink-0 rounded-md text-muted-foreground hover:bg-muted/80 hover:text-foreground";

  return (
    <div className="relative z-20 w-full min-w-0">
      {slashMenuOpen ? (
        <SlashCommandMenu
          commands={slashCommands}
          activeIndex={slashActiveIndex}
          onHighlight={setSlashActiveIndex}
          onSelect={selectSlashCommand}
          groupByCategory={slashFilter.length === 0}
        />
      ) : null}
      <div
        className={cn(
          "rounded-xl border border-[var(--enterprise-border)]/90",
          "bg-[var(--enterprise-surface)] shadow-sm transition-[box-shadow,border-color]",
          "focus-within:border-[var(--enterprise-accent)]/35 focus-within:shadow-md focus-within:shadow-black/10",
          voice.isListening && "border-primary/40 ring-1 ring-primary/25",
        )}
      >
        {hasContextRow ? (
          <div className="flex flex-col gap-2 border-b border-[var(--enterprise-border)]/50 px-3 py-2">
            {activeReportId ? (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
                <FileText className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  Report
                  {activeReportTitle ? `: ${activeReportTitle}` : ""}
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="size-6"
                  aria-label="Remove report context"
                  onClick={clearActiveReport}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : null}
            {scopeId !== "all" ? <DocumentScopeSelector compact /> : null}
            <ComposerAttachments
              integrated
              onAttachmentsChange={handleAttachmentsChange}
            />
            {activeUpload ? (
              <div className="text-[11px] text-muted-foreground">
                {activeUpload.status === "uploading" ? (
                  <div className="flex items-start gap-2">
                    <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" />
                    <UploadTransferProgress
                      item={activeUpload}
                      compact
                      className="flex-1"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                    <span className="truncate">
                      {activeUpload.chatReady
                        ? `Indexing ${activeUpload.file.name}…`
                        : activeUpload.status === "processing"
                          ? `Preparing ${activeUpload.file.name}…`
                          : `Queued: ${activeUpload.file.name}`}
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <ComposerAttachments
            integrated
            className="sr-only"
            onAttachmentsChange={handleAttachmentsChange}
          />
        )}

        <div className="relative px-3 pt-2">
          <textarea
            id="chat-composer-input"
            ref={textareaRef}
            rows={1}
            placeholder={
              voice.isListening
                ? "Listening…"
                : "Ask a question — / for commands, attach files below"
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (slashMenuOpen && slashCommands.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSlashActiveIndex((i) =>
                    i + 1 >= slashCommands.length ? 0 : i + 1,
                  );
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSlashActiveIndex((i) =>
                    i - 1 < 0 ? slashCommands.length - 1 : i - 1,
                  );
                  return;
                }
                if (e.key === "Tab") {
                  e.preventDefault();
                  selectSlashCommand(slashCommands[slashActiveIndex]);
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  selectSlashCommand(slashCommands[slashActiveIndex]);
                  return;
                }
              }
              if (slashMenuOpen && e.key === "Escape") {
                e.preventDefault();
                onChange("");
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isTyping && value.trim()) onSend();
              }
            }}
            disabled={isTyping || !!activeUpload || disabled}
            className={cn(
              "w-full resize-none bg-transparent py-1 text-[14px] leading-relaxed",
              "placeholder:text-muted-foreground/80 focus:outline-none",
              "min-h-[44px] max-h-[min(40vh,220px)]",
            )}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
            }}
            aria-autocomplete={slashMenuOpen ? "list" : undefined}
            aria-expanded={slashMenuOpen}
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={DOCUMENT_ACCEPT}
          multiple
          onChange={(e) => void handleFiles(e.target.files)}
        />

        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
          <div className="flex min-w-0 items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={iconBtnClass}
              disabled={!!activeUpload || disabled}
              title="Upload file"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>

            <DropdownMenu onOpenChange={(open) => open && void loadLibrary()}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={iconBtnClass}
                  disabled={!!activeUpload || disabled}
                  title="Add from library"
                >
                  <FolderOpen className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-72 w-72 overflow-y-auto"
              >
                <DropdownMenuLabel>Library files</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {libraryLoading ? (
                  <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
                ) : scopedLibraryDocs.length === 0 ? (
                  <DropdownMenuItem disabled>
                    {scopeId === "all"
                      ? "No indexed files yet"
                      : "No files in this document scope"}
                  </DropdownMenuItem>
                ) : (
                  scopedLibraryDocs.map((doc) => (
                    <DropdownMenuItem
                      key={doc.document_id}
                      className="truncate"
                      onSelect={() => void attachFromLibrary(doc)}
                    >
                      {doc.file_name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <ChatToolsMenu
              disabled={!!activeUpload || disabled}
              compact
              className={cn(iconBtnClass, "size-7")}
              onInsert={(text) => {
                onChange(text);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {voice.isSupported ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  iconBtnClass,
                  voice.isListening && "bg-primary/10 text-primary",
                )}
                disabled={!!activeUpload || disabled}
                title={voice.isListening ? "Stop voice input" : "Voice input"}
                onClick={() => voice.toggle(value)}
              >
                {voice.isListening ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
            ) : null}

            {isTyping ? (
              <Button
                size="icon"
                variant="outline"
                onClick={onStop}
                title="Stop generation"
                className="size-8 shrink-0 rounded-lg"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={onSend}
                disabled={!value.trim() || !!activeUpload || disabled}
                className="size-8 shrink-0 rounded-lg"
                title="Send message"
              >
                <SendHorizontal className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {voice.isListening ? (
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-primary">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Voice input active — speak clearly, then tap the mic to stop
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => voice.stop()}
          >
            <X className="size-3" />
            Stop
          </button>
        </div>
      ) : null}
    </div>
  );
}
