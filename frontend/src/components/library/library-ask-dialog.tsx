"use client";

import { useState } from "react";
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
import { startChatWithLibraryDocument } from "@/lib/library-chat";
import { useChatStore } from "@/hooks/use-chat-store";
import { LibraryDocument } from "@/types/document";
import { logApiError } from "@/lib/api";

interface LibraryAskDialogProps {
  doc: LibraryDocument | null;
  onOpenChange: (open: boolean) => void;
}

export function LibraryAskDialog({ doc, onOpenChange }: LibraryAskDialogProps) {
  const router = useRouter();
  const addSession = useChatStore((s) => s.addSession);
  const [question, setQuestion] = useState("");
  const [isStarting, setIsStarting] = useState(false);

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
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" />
            Ask about this file
          </DialogTitle>
          <DialogDescription className="truncate">
            {doc?.file_name ?? ""}
          </DialogDescription>
        </DialogHeader>
        <textarea
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What would you like to know about this document?"
          className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleStart();
            }
          }}
        />
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
