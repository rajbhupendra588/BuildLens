"use client";

import { useRef, useState } from "react";
import { Sun, Moon, Monitor, Download, Upload, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/api";
import { useChatStore } from "@/hooks/use-chat-store";
import { ChatSession } from "@/types/chat";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function PreferencesSettings() {
  const { theme, setTheme } = useTheme();
  const { setSessions, setCurrentSessionId } = useChatStore();
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await apiRequest<object[]>("/chat/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `docrag-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Chat history exported");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await apiRequest("/chat/import", {
        method: "POST",
        body: JSON.stringify(data),
      });
      // Reload sessions
      const sessions = await apiRequest<ChatSession[]>("/chat/sessions");
      setSessions(sessions);
      setCurrentSessionId(null);
      toast.success("Chat history imported");
    } catch {
      toast.error("Import failed — make sure the file is a valid DocRAG backup");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>
          Appearance settings and data management.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Theme</p>
          <div className="flex gap-2">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={theme === value ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme(value)}
                className={cn("gap-1.5", theme === value && "")}
              >
                <Icon className="size-3.5" />
                {label}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Export / Import */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Data Backup</p>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm">Export Chat History</p>
              <p className="text-xs text-muted-foreground">
                Download all sessions and messages as a JSON file.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="size-3.5 animate-spin mr-1" />
              ) : (
                <Download className="size-3.5 mr-1" />
              )}
              Export
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm">Import Chat History</p>
              <p className="text-xs text-muted-foreground">
                Restore sessions from a DocRAG backup file (.json).
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="size-3.5 animate-spin mr-1" />
              ) : (
                <Upload className="size-3.5 mr-1" />
              )}
              Import
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </CardContent>
    </Card>
  );
}
