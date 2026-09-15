"use client";

import { useState } from "react";
import { useChatStore } from "@/hooks/use-chat-store";
import { apiRequest, logApiError } from "@/lib/api";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChatSession } from "@/types/chat";
import { Pencil, Pin, Trash2 } from "lucide-react";

export function SessionActions({
  sessionId,
  initialTitle,
}: {
  sessionId: string;
  initialTitle: string;
}) {
  const {
    removeSession,
    updateSessionTitle,
    updateSessionPin,
    setSessions,
    currentSessionId,
    sessions,
  } = useChatStore();
  const router = useRouter();
  const isPinned = sessions.find((s) => s.id === sessionId)?.is_pinned ?? false;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(initialTitle);
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    try {
      await apiRequest(`/chat/sessions/${sessionId}`, { method: "DELETE" });
      removeSession(sessionId);
      if (currentSessionId === sessionId) {
        router.push("/app");
      }
    } catch (error) {
      logApiError("Failed to delete session", error);
    }
  };

  const handleTogglePin = async () => {
    const next = !isPinned;
    try {
      await apiRequest(
        `/chat/sessions/${sessionId}?is_pinned=${next ? "true" : "false"}`,
        { method: "PATCH" },
      );
      updateSessionPin(sessionId, next);
      const refreshed = await apiRequest<ChatSession[]>("/chat/sessions");
      setSessions(refreshed);
    } catch (error) {
      logApiError("Failed to pin session", error);
    }
  };

  const handleRename = async () => {
    if (!newTitle.trim()) return;
    setIsLoading(true);
    try {
      await apiRequest(
        `/chat/sessions/${sessionId}?title=${encodeURIComponent(newTitle)}`,
        {
          method: "PATCH",
        },
      );
      updateSessionTitle(sessionId, newTitle);
      setIsRenameOpen(false);
    } catch (error) {
      logApiError("Failed to rename session", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <DropdownMenuContent side="right" align="start">
        <DropdownMenuItem onClick={() => void handleTogglePin()}>
          <Pin className="mr-2 size-4" />
          {isPinned ? "Unpin conversation" : "Pin conversation"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setIsRenameOpen(true)}>
          <Pencil className="mr-2 size-4" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setIsDeleteDialogOpen(true)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>

      {/* Rename Dialog */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={isLoading}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this chat session and all its
              messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
