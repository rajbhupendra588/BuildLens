"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, apiUpload } from "@/lib/api";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
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
  const [isUploading, setIsUploading] = useState(false);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const uploadFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large — max 20 MB (got ${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const promise = apiUpload("/ingest/upload", formData);

    toast.promise(promise, {
      loading: `Indexing ${file.name}…`,
      success: () => {
        fetchDocs();
        return `${file.name} indexed successfully.`;
      },
      error: (err) => `Failed to upload: ${err?.message ?? "unknown error"}`,
    });

    try {
      await promise;
    } catch {
      // error already shown via toast
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  // Drag-and-drop handlers
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
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;

    const promise = apiRequest(`/documents/${docToDelete.document_id}`, { method: "DELETE" });

    toast.promise(promise, {
      loading: "Removing document…",
      success: "Document removed from AI memory.",
      error: "Could not delete document.",
    });

    try {
      await promise;
      setDocs((prev) => prev.filter((d) => d.document_id !== docToDelete.document_id));
    } finally {
      setDocToDelete(null);
    }
  };

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
              <RefreshCw className={cn("size-3.5 mr-2", isLoading && "animate-spin")} />
              Sync
            </Button>
          </div>

          {/* ── Drop zone ── */}
          <div className="p-4 border-b bg-background">
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              onChange={handleInputChange}
              accept={ACCEPTED_EXTENSIONS}
            />
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed",
                "py-8 px-4 cursor-pointer transition-colors select-none",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
                isUploading && "pointer-events-none opacity-60",
              )}
            >
              {isUploading ? (
                <>
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">Processing document…</p>
                </>
              ) : (
                <>
                  <UploadCloud
                    className={cn(
                      "size-8 transition-colors",
                      isDragging ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <p className="text-sm font-medium">
                    {isDragging ? "Drop to upload" : "Click or drag a file here"}
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    PDF, DOCX, PPTX, images, spreadsheets, source code, Markdown and more · max 20 MB
                  </p>
                </>
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
                    <TableCell colSpan={2} className="text-center py-12 text-muted-foreground">
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
                          <span className="truncate max-w-[380px]">{doc.file_name}</span>
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
