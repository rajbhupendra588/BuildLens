"use client";

import { useRef } from "react";
import {
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
import { enqueueDocumentFiles, useUploadQueueStore } from "@/stores/upload-queue-store";
import { useChatStore } from "@/hooks/use-chat-store";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { toast } from "sonner";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isTyping: boolean;
  onStop: () => void;
  disabled?: boolean;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  isTyping,
  onStop,
  disabled,
}: ChatComposerProps) {
  const { currentSessionId } = useChatStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadQueue = useUploadQueueStore((s) => s.uploadQueue);
  const activeUpload = uploadQueue.find(
    (i) =>
      i.status === "pending" ||
      i.status === "uploading" ||
      i.status === "processing",
  );

  const voice = useVoiceInput({
    onInterim: (text) => onChange(text),
    onFinal: (text) => onChange(text),
  });

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

    if (currentSessionId) {
      try {
        const attachments = await apiRequest<{ id: string }[]>(
          `/chat/sessions/${currentSessionId}/attachments`,
        );
        const slots = MAX_SESSION_ATTACHMENTS - attachments.length;
        if (slots <= 0) {
          toast.error(
            `Maximum ${MAX_SESSION_ATTACHMENTS} files per conversation. Remove a file before uploading another.`,
          );
          return;
        }
        if (list.length > slots) {
          toast.message(
            `Only ${slots} more file${slots === 1 ? "" : "s"} can be added to this chat.`,
          );
          enqueueDocumentFiles(list.slice(0, slots), currentSessionId);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      } catch {
        toast.error("Could not verify attachment limit. Try again.");
        return;
      }
    }

    enqueueDocumentFiles(list, currentSessionId);
    toast.message(
      currentSessionId
        ? list.length === 1
          ? `Uploading ${list[0].name} — you can chat as soon as preview is ready`
          : `Uploading ${list.length} files for this conversation…`
        : list.length === 1
          ? `Uploading ${list[0].name} in the background…`
          : `Uploading ${list.length} files in the background…`,
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="w-full">
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
          onChange={(e) => void handleFiles(e.target.files)}
        />

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          disabled={!!activeUpload || disabled}
          title="Upload PDF or document"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="size-5" />
        </Button>

        <textarea
          rows={1}
          placeholder={
            voice.isListening
              ? "Listening…"
              : "Message BuildLens — attach a PDF or ask about your library…"
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isTyping && value.trim()) onSend();
            }
          }}
          disabled={isTyping || !!activeUpload || disabled}
          className={cn(
            "flex-1 resize-none bg-transparent px-1 py-2.5 text-sm leading-relaxed",
            "placeholder:text-muted-foreground focus:outline-none min-h-[44px] max-h-40",
          )}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
        />

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
