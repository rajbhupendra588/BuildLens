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
import {
  FileText,
  Trash2,
  RefreshCw,
  Database,
  Loader2,
  Plus,
  Upload,
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

interface Document {
  document_id: string;
  file_name: string;
}

export function KnowledgeBase() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest<{ documents: Document[] }>(
        "/documents",
      );
      setDocs(response.documents);
    } catch (error) {
      console.error("Failed to fetch documents", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      // 10MB
      toast.error("File is too large (max 10MB)");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const uploadPromise = apiUpload("/ingest/upload", formData);

    toast.promise(uploadPromise, {
      loading: `Uploading ${file.name}...`,
      success: () => {
        fetchDocs(); // Refresh list
        return `${file.name} has been indexed successfully.`;
      },
      error: (err) => `Failed to upload: ${err.message}`,
    });

    try {
      await uploadPromise;
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;

    const deletePromise = apiRequest(`/documents/${docToDelete.document_id}`, {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting document...",
      success: "Document removed from AI memory.",
      error: "Could not delete document.",
    });

    try {
      await deletePromise;
      setDocs((prev) =>
        prev.filter((d) => d.document_id !== docToDelete.document_id),
      );
    } finally {
      setDocToDelete(null);
    }
  };

  return (
    <>
      <Dialog onOpenChange={(open) => open && fetchDocs()}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Database className="size-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
          {/* Header Section */}
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
            {/* Sync Button - ไม่ทับปุ่ม Close แน่นอนเพราะอยู่ใน Flex box */}
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

          {/* Upload Section */}
          <div className="p-4 border-b bg-background">
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              onChange={handleUpload}
              accept=".pdf,.txt,.docx,.csv,.md"
            />
            <Button
              className="w-full border-dashed py-6"
              variant="outline"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {isUploading ? "Processing Document..." : "Add New Document"}
            </Button>
          </div>

          {/* Table Section */}
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
                        <Upload className="size-8" />
                        <p>No documents found. Upload one to start RAG.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  docs.map((doc) => (
                    <TableRow key={doc.document_id} className="group">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-blue-500 shrink-0" />
                          <span className="truncate max-w-[300px]">
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

      {/* Alert Dialog for Deletion */}
      <AlertDialog
        open={!!docToDelete}
        onOpenChange={(open) => !open && setDocToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will erase all knowledge associated with{" "}
              <b>{docToDelete?.file_name}</b>. AI will no longer be able to
              answer questions based on this file.
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
