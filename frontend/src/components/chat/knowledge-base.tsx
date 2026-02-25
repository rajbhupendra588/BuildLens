"use client";

import { useRef, useState } from "react";
import { apiRequest, apiUploadWithProgress } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import {
  FileText,
  FileCode,
  FileSpreadsheet,
  Image,
  File,
  Trash2,
  RefreshCw,
  Database,
  Loader2,
  UploadCloud,
  Check,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Document {
  document_id: string;
  file_name: string;
}

interface UploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  progress: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB — matches backend limit

/**
 * All extensions accepted by the backend.
 * Grouped for readability; joined into a single accept string below.
 */
const ACCEPTED_EXTENSIONS = [
  // Documents
  ".pdf", ".docx", ".pptx", ".txt", ".md", ".puml",
  // Tabular
  ".csv", ".xlsx",
  // Data
  ".json", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env",
  // Images
  ".png", ".jpg", ".jpeg",
  // Web
  ".html", ".htm", ".css", ".scss", ".sass",
  // Source code
  ".py", ".pyw",
  ".js", ".jsx", ".mjs", ".cjs",
  ".ts", ".tsx",
  ".java",
  ".kt", ".kts",
  ".go",
  ".rs",
  ".c", ".h",
  ".cpp", ".cc", ".cxx", ".hpp", ".hxx",
  ".rb",
  ".php",
  ".swift",
  ".dart",
  ".sh", ".bash", ".zsh",
  ".sql",
  ".r",
  ".scala",
  ".lua",
  ".tf",
].join(",");

// ---------------------------------------------------------------------------
// File-type icon helper
// ---------------------------------------------------------------------------

function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  const codeExts = new Set([
    "py","pyw","js","jsx","mjs","cjs","ts","tsx","java","kt","kts","go","rs",
    "c","h","cpp","cc","cxx","hpp","hxx","rb","php","swift","dart","sh","bash",
    "zsh","sql","r","scala","lua","tf","html","htm","css","scss","sass","xml",
    "yaml","yml","toml","ini","cfg","env",
  ]);
  const spreadsheetExts = new Set(["csv","xlsx","xls"]);
  const imageExts = new Set(["png","jpg","jpeg","gif","webp","svg"]);

  if (imageExts.has(ext))
    return <Image className={cn("size-4 text-emerald-500", className)} />;
  if (spreadsheetExts.has(ext))
    return <FileSpreadsheet className={cn("size-4 text-green-600", className)} />;
  if (codeExts.has(ext))
    return <FileCode className={cn("size-4 text-violet-500", className)} />;
  if (ext === "pdf")
    return <FileText className={cn("size-4 text-red-500", className)} />;
  if (["doc","docx","pptx","txt","md"].includes(ext))
    return <FileText className={cn("size-4 text-blue-500", className)} />;

  return <File className={cn("size-4 text-muted-foreground", className)} />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeBase() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isQueueRunning = useRef(false);
  // Mirror of uploadQueue kept in sync for reading inside async loops
  const queueRef = useRef<UploadItem[]>([]);
  // Prevents onClick from opening the file picker right after a drop
  const justDroppedRef = useRef(false);

  const isQueueActive = uploadQueue.length > 0;

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest<{ documents: Document[] }>("/documents");
      setDocs(response.documents);
    } catch (error) {
      console.error("Failed to fetch documents", error);
    } finally {
      setIsLoading(false);
    }
  };

  /** Update one item — mutates the ref synchronously then triggers a re-render. */
  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    const next = queueRef.current.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    queueRef.current = next;
    setUploadQueue(next);
  };

  /**
   * Sequential upload loop.
   * Uses queueRef so it always sees newly-added pending items even if they
   * were appended after this call started.
   */
  const runQueue = async () => {
    if (isQueueRunning.current) return;
    isQueueRunning.current = true;

    // Process items until no pending ones remain.
    // New files enqueued during processing are picked up on the next iteration.
    while (true) {
      const item = queueRef.current.find((i) => i.status === "pending");
      if (!item) break;

      updateItem(item.id, { status: "uploading", progress: 0 });

      try {
        const formData = new FormData();
        formData.append("file", item.file);

        await apiUploadWithProgress("/ingest/upload", formData, (percent) => {
          updateItem(item.id, { progress: percent });
          if (percent === 100) {
            updateItem(item.id, { status: "processing" });
          }
        });

        updateItem(item.id, { status: "done", progress: 100 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        updateItem(item.id, { status: "error", error: msg });
      }
    }

    const doneCount = queueRef.current.filter((i) => i.status === "done").length;
    await fetchDocs();

    if (doneCount > 0) {
      toast.success(
        `${doneCount} file${doneCount > 1 ? "s" : ""} indexed successfully`,
      );
    }

    setTimeout(() => {
      queueRef.current = [];
      setUploadQueue([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }, 1500);

    isQueueRunning.current = false;
  };

  const enqueueFiles = (files: File[]) => {
    const validItems: UploadItem[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(
          `${file.name} is too large — max 20 MB (got ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
        );
        continue;
      }
      validItems.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        status: "pending",
        progress: 0,
      });
    }

    if (validItems.length === 0) return;

    // Update the ref SYNCHRONOUSLY so runQueue sees the new items immediately.
    // setUploadQueue(updater) would defer the ref update to the React render cycle,
    // causing runQueue to find no pending items and exit prematurely.
    const next = [...queueRef.current, ...validItems];
    queueRef.current = next;
    setUploadQueue(next);

    // If the queue is already running it will pick up new pending items
    // in the next while-loop iteration. Otherwise start it.
    if (!isQueueRunning.current) {
      runQueue();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) enqueueFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // Some browsers fire a click event after a drop; suppress it.
    justDroppedRef.current = true;
    setTimeout(() => { justDroppedRef.current = false; }, 200);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) enqueueFiles(files);
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;

    const promise = apiRequest(`/documents/${docToDelete.document_id}`, {
      method: "DELETE",
    });

    toast.promise(promise, {
      loading: "Removing document…",
      success: "Document removed from AI memory.",
      error: "Could not delete document.",
    });

    try {
      await promise;
      setDocs((prev) =>
        prev.filter((d) => d.document_id !== docToDelete.document_id),
      );
    } finally {
      setDocToDelete(null);
    }
  };

  const doneCount = uploadQueue.filter((i) => i.status === "done").length;
  const totalCount = uploadQueue.length;

  return (
    <>
      <Dialog onOpenChange={(open) => open && fetchDocs()}>
        <DialogTrigger asChild>
          <SidebarMenuButton tooltip="Knowledge Base">
            <div className="flex items-center gap-2 cursor-pointer">
              <Database className="size-4" />
              <span>Knowledge Base</span>
            </div>
          </SidebarMenuButton>
        </DialogTrigger>

        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
          {/* ── Header ── */}
          <div className="p-6 border-b flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Database className="size-5 text-primary" />
              </div>
              <div>
                <DialogTitle>Knowledge Base</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Manage files indexed in Vector DB
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDocs}
              disabled={isLoading}
              className="h-8"
            >
              <RefreshCw
                className={cn("size-3.5 mr-2", isLoading && "animate-spin")}
              />
              Sync
            </Button>
          </div>

          {/* ── Drop zone ── */}
          <div className="p-4 border-b bg-background">
            <input
              type="file"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleInputChange}
              accept={ACCEPTED_EXTENSIONS}
            />
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => { if (!justDroppedRef.current) fileInputRef.current?.click(); }}
              className={cn(
                "rounded-lg border-2 border-dashed transition-colors select-none cursor-pointer",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
              )}
            >
              {isQueueActive ? (
                /* ── Upload queue list ── */
                <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-3">
                    Uploading {doneCount} / {totalCount} files
                  </p>
                  <div className="flex flex-col gap-2">
                    {uploadQueue.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <FileIcon name={item.file.name} className="shrink-0" />

                        <span
                          className="text-sm truncate min-w-0 flex-1"
                          title={item.file.name}
                        >
                          {item.file.name}
                        </span>

                        <div className="flex items-center gap-2 shrink-0 w-44">
                          {item.status === "uploading" && (
                            <>
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all duration-150"
                                  style={{ width: `${item.progress}%` }}
                                />
                              </div>
                              <span className="text-xs text-blue-500 w-20 text-right">
                                {item.progress}% uploading
                              </span>
                            </>
                          )}
                          {item.status === "processing" && (
                            <>
                              <Loader2 className="size-3.5 animate-spin text-amber-500 shrink-0" />
                              <span className="text-xs text-amber-500">
                                Processing…
                              </span>
                            </>
                          )}
                          {item.status === "done" && (
                            <>
                              <Check className="size-3.5 text-green-500 shrink-0" />
                              <span className="text-xs text-green-500">Done</span>
                            </>
                          )}
                          {item.status === "error" && (
                            <>
                              <X className="size-3.5 text-destructive shrink-0" />
                              <span
                                className="text-xs text-destructive truncate max-w-[100px]"
                                title={item.error}
                              >
                                {item.error ?? "Error"}
                              </span>
                            </>
                          )}
                          {item.status === "pending" && (
                            <>
                              <div className="size-2 rounded-full bg-muted-foreground/40 shrink-0" />
                              <span className="text-xs text-muted-foreground">
                                Pending
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Click or drop more files to add to queue
                  </p>
                </div>
              ) : (
                /* ── Idle drop zone ── */
                <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
                  <UploadCloud
                    className={cn(
                      "size-8 transition-colors",
                      isDragging ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <p className="text-sm font-medium">
                    {isDragging ? "Drop to upload" : "Click or drag files here"}
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    PDF, DOCX, images, code, spreadsheets… · max 20 MB each ·
                    multiple files supported
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Document table ── */}
          <div className="flex-1 overflow-auto p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead className="w-[100px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.length === 0 && !isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="text-center py-12 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2 opacity-50">
                        <UploadCloud className="size-8" />
                        <p>No documents yet. Upload one to start RAG.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  docs.map((doc) => (
                    <TableRow key={doc.document_id} className="group">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileIcon name={doc.file_name} />
                          <span className="truncate max-w-[380px]">
                            {doc.file_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setDocToDelete(doc)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog
        open={!!docToDelete}
        onOpenChange={(open) => !open && setDocToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will erase all knowledge associated with{" "}
              <b>{docToDelete?.file_name}</b>. The AI will no longer answer
              questions based on this file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
