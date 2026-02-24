"use client";

import { useEffect, useState } from "react";
import { Loader2, Database, MessageSquare } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/api";
import { StatsResponse } from "@/types/settings";
import { useChatStore } from "@/hooks/use-chat-store";
import { toast } from "sonner";

export function StorageSettings() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [clearingVector, setClearingVector] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const { setSessions, setCurrentSessionId } = useChatStore();

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const data = await apiRequest<StatsResponse>("/data/stats");
      setStats(data);
    } catch {
      toast.error("Failed to load storage stats");
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleClearVector = async () => {
    setClearingVector(true);
    try {
      await apiRequest("/data/vector", { method: "DELETE" });
      toast.success("Knowledge base cleared");
      fetchStats();
    } catch {
      toast.error("Failed to clear knowledge base");
    } finally {
      setClearingVector(false);
    }
  };

  const handleClearChat = async () => {
    setClearingChat(true);
    try {
      await apiRequest("/data/chat", { method: "DELETE" });
      setSessions([]);
      setCurrentSessionId(null);
      toast.success("Chat history cleared");
    } catch {
      toast.error("Failed to clear chat history");
    } finally {
      setClearingChat(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage</CardTitle>
        <CardDescription>
          View storage statistics and manage data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground">Indexed Files</p>
            <p className="text-2xl font-semibold">
              {statsLoading ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : (
                stats?.total_files ?? "—"
              )}
            </p>
          </div>
          <div className="rounded-md border p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground">Total Chunks</p>
            <p className="text-2xl font-semibold">
              {statsLoading ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : (
                stats?.total_chunks ?? "—"
              )}
            </p>
          </div>
        </div>

        {/* Danger zone */}
        <div className="rounded-md border border-destructive/40 p-4 space-y-3">
          <p className="text-sm font-medium text-destructive">Danger Zone</p>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-2">
              <Database className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Clear Knowledge Base</p>
                <p className="text-xs text-muted-foreground">
                  Removes all indexed documents and vectors permanently.
                </p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={clearingVector}>
                  {clearingVector ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Clear"
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Knowledge Base?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all indexed documents and their
                    vector embeddings. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearVector}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear Knowledge Base
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-2">
              <MessageSquare className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Clear Chat History</p>
                <p className="text-xs text-muted-foreground">
                  Deletes all chat sessions and messages permanently.
                </p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={clearingChat}>
                  {clearingChat ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Clear"
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Chat History?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all chat sessions and messages.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearChat}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear Chat History
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
