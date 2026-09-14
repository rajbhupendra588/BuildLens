"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  SendHorizontal,
  Square,
  X,
} from "lucide-react";
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
import { ComposerAttachments } from "./composer-attachments";
import { SlashCommandMenu } from "./slash-command-menu";
import { useChatDocumentPreview } from "./chat-document-preview-context";
import {
  applySlashCommandSelection,
  filterSlashCommands,
  getSlashCommandFilter,
  isSlashCommandMenuOpen,
  type ChatSlashCommand,
} from "@/lib/chat-slash-commands";
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
      setLibraryDocs(res.documents ?? []);
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

  return (
    <div className="w-full max-w-3xl mx-auto">
      <ComposerAttachments onAttachmentsChange={onAttachmentCountChange} />

      {activeUpload ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin shrink-0" />
          <span className="truncate flex-1">
            {activeUpload.chatReady
              ? `Library indexing ${activeUpload.file.name}…`
              : activeUpload.status === "processing"
                ? `Preparing ${activeUpload.file.name} for chat…`
                : activeUpload.status === "uploading"
                  ? `Uploading ${activeUpload.file.name} (${activeUpload.progress}%)`
                  : `Queued: ${activeUpload.file.name}`}
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          "flex items-end gap-1 rounded-[1.75rem] border bg-background px-2 py-2 shadow-sm",
          "ring-1 ring-border/60 focus-within:ring-2 focus-within:ring-primary/25",
          voice.isListening && "ring-2 ring-primary/40 border-primary/30",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={DOCUMENT_ACCEPT}
          multiple
          onChange={(e) => void handleFiles(e.target.files)}
        />

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          disabled={!!activeUpload || disabled}
          title="Upload file"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="size-5" />
        </Button>

        <DropdownMenu onOpenChange={(open) => open && void loadLibrary()}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              disabled={!!activeUpload || disabled}
              title="Add from library"
            >
              <FolderOpen className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
            <DropdownMenuLabel>Library files</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {libraryLoading ? (
              <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
            ) : libraryDocs.length === 0 ? (
              <DropdownMenuItem disabled>No indexed files yet</DropdownMenuItem>
            ) : (
              libraryDocs.map((doc) => (
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

        <div className="relative min-w-0 flex-1">
          {slashMenuOpen ? (
            <SlashCommandMenu
              commands={slashCommands}
              activeIndex={slashActiveIndex}
              onHighlight={setSlashActiveIndex}
              onSelect={selectSlashCommand}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={
              voice.isListening
                ? "Listening…"
                : "Ask about your documents… (type / for commands)"
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
                if (e.key === "Enter" || e.key === "Tab") {
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
              "w-full resize-none bg-transparent px-1 py-2.5 text-sm leading-relaxed",
              "placeholder:text-muted-foreground focus:outline-none min-h-[44px] max-h-40",
            )}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
            aria-autocomplete={slashMenuOpen ? "list" : undefined}
            aria-expanded={slashMenuOpen}
          />
        </div>

        {voice.isSupported ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              "size-9 shrink-0 rounded-full",
              voice.isListening
                ? "text-primary bg-primary/10 hover:bg-primary/15"
                : "text-muted-foreground hover:text-foreground",
            )}
            disabled={!!activeUpload || disabled}
            title={voice.isListening ? "Stop voice input" : "Voice input"}
            onClick={() => voice.toggle(value)}
          >
            {voice.isListening ? (
              <MicOff className="size-5" />
            ) : (
              <Mic className="size-5" />
            )}
          </Button>
        ) : null}

        {isTyping ? (
          <Button
            size="icon"
            variant="outline"
            onClick={onStop}
            title="Stop generation"
            className="shrink-0 size-9 rounded-full"
          >
            <Square className="size-4 fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={onSend}
            disabled={!value.trim() || !!activeUpload || disabled}
            className="shrink-0 size-9 rounded-full"
            title="Send message"
          >
            <SendHorizontal className="size-5" />
          </Button>
        )}
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
