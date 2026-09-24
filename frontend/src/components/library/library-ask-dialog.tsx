"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SlashCommandMenu } from "@/components/chat/slash-command-menu";
import { ChatToolsMenu } from "@/components/chat/chat-tools-menu";
import { startChatWithLibraryDocument } from "@/lib/library-chat";
import { useChatStore } from "@/hooks/use-chat-store";
import { LibraryDocument } from "@/types/document";
import { logApiError } from "@/lib/api";
import {
  applySlashCommandSelection,
  filterSlashCommands,
  getSlashCommandFilter,
  isSlashCommandMenuOpen,
  type ChatSlashCommand,
} from "@/lib/chat-slash-commands";

interface LibraryAskDialogProps {
  doc: LibraryDocument | null;
  onOpenChange: (open: boolean) => void;
}

export function LibraryAskDialog({ doc, onOpenChange }: LibraryAskDialogProps) {
  const router = useRouter();
  const addSession = useChatStore((s) => s.addSession);
  const [question, setQuestion] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const slashMenuOpen =
    !isStarting && isSlashCommandMenuOpen(question);
  const slashFilter = getSlashCommandFilter(question);
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

  const selectSlashCommand = useCallback((cmd: ChatSlashCommand) => {
    setQuestion(applySlashCommandSelection(cmd));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleClose = (open: boolean) => {
    if (!open) {
      setQuestion("");
    }
    onOpenChange(open);
  };

  const handleStart = async () => {
    if (!doc || !question.trim() || isStarting) return;
    setIsStarting(true);
    try {
      const { session, initialQuestion } = await startChatWithLibraryDocument(
        doc,
        question,
      );
      addSession(session);
      handleClose(false);
      const qParam = initialQuestion
        ? `?q=${encodeURIComponent(initialQuestion)}`
        : "";
      router.push(`/chat/${session.id}${qParam}`);
    } catch (error) {
      logApiError("Could not start chat for document", error);
      toast.error("Could not start a chat for this file. Try again.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Dialog open={!!doc} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" />
              Ask about this file
            </DialogTitle>
            <ChatToolsMenu
              compact
              disabled={isStarting}
              onInsert={(text) => {
                setQuestion(text);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
          </div>
          <DialogDescription className="truncate">
            {doc?.file_name ?? ""}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          {slashMenuOpen ? (
            <SlashCommandMenu
              commands={slashCommands}
              activeIndex={slashActiveIndex}
              onHighlight={setSlashActiveIndex}
              onSelect={selectSlashCommand}
              groupByCategory={slashFilter.length === 0}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question or type / for commands (report, risk register, FAQ…)"
            disabled={isStarting}
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
            aria-autocomplete={slashMenuOpen ? "list" : undefined}
            aria-expanded={slashMenuOpen}
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
                setQuestion("");
                return;
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleStart();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleStart()}
            disabled={!question.trim() || isStarting}
          >
            {isStarting ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <MessageSquare className="size-4 mr-2" />
            )}
            Start chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
