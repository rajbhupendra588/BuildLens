"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiRequest, isTransientNetworkError } from "@/lib/api";
import {
  uploadAndIndexDocument,
  isLargeBackgroundUpload,
} from "@/lib/document-upload";
import {
  notifyBackgroundUploadStarted,
  prepareUploadNotifications,
} from "@/lib/upload-notifications";
import { collectFilesFromDataTransfer } from "@/lib/collect-dropped-files";
import { DOCUMENTS_CHANGED_EVENT, notifyDocumentsChanged } from "@/lib/document-library-events";
import {
  librarySlotsRemaining,
  MAX_DOCUMENT_SIZE,
  MAX_LIBRARY_FILES,
  maxDocumentSizeLabel,
} from "@/lib/document-upload";
import { LibraryDocument } from "@/types/document";
import { useUploadQueueStore } from "@/stores/upload-queue-store";

export function useDocumentLibrary() {
  const [docs, setDocs] = useState<LibraryDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [docToDelete, setDocToDelete] = useState<LibraryDocument | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const uploadQueue = useUploadQueueStore((s) => s.uploadQueue);
  const enqueueFiles = useUploadQueueStore((s) => s.enqueueFiles);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const justDroppedRef = useRef(false);

  useEffect(() => {
    dirInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  const fetchDocs = async (options?: {
    silent?: boolean;
  }): Promise<boolean> => {
    if (!options?.silent) setIsLoading(true);
    try {
      const response = await apiRequest<{ documents: LibraryDocument[] }>(
        "/documents/",
        { retries: 8 },
      );
      setDocs(response.documents);
      return true;
    } catch (error) {
      if (!options?.silent) {
        const hint = isTransientNetworkError(error)
          ? "The API is busy indexing—try Refresh in a moment."
          : "Could not load the document library.";
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${hint} ${message}`);
      }
      return false;
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocs();
    const onChanged = () => {
      void fetchDocs({ silent: true });
    };
    window.addEventListener(DOCUMENTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(DOCUMENTS_CHANGED_EVENT, onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const hasIndexing = docs.some((d) => d.index_status === "indexing");
    if (!hasIndexing) return;
    const timer = window.setInterval(() => {
      void fetchDocs({ silent: true });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [docs]);

  const enqueueLibraryFiles = (files: File[]) => {
    if (files.length === 0) return;
    const pendingLibrary = uploadQueue.filter((i) => !i.sessionId).length;
    const slots = librarySlotsRemaining(docs.length + pendingLibrary);
    if (slots <= 0) {
      toast.error(
        `Library limit reached (max ${MAX_LIBRARY_FILES} files). Remove a file before uploading.`,
      );
      return;
    }
    const batch = files.slice(0, slots);
    if (batch.length < files.length) {
      toast.message(
        `Only ${batch.length} file${batch.length === 1 ? "" : "s"} added — library holds up to ${MAX_LIBRARY_FILES} files at a time.`,
      );
    }
    enqueueFiles(batch);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) enqueueLibraryFiles(files);
    e.target.value = "";
  };

  const handleDirInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) enqueueLibraryFiles(files);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    justDroppedRef.current = true;
    setTimeout(() => {
      justDroppedRef.current = false;
    }, 200);
    const files = await collectFilesFromDataTransfer(e.dataTransfer.items);
    if (files.length > 0) enqueueLibraryFiles(files);
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
      notifyDocumentsChanged();
    } finally {
      setDocToDelete(null);
    }
  };

  const openFilePicker = () => {
    if (!justDroppedRef.current) fileInputRef.current?.click();
  };

  const restoreLegacyDocument = async (
    doc: LibraryDocument,
    file: File,
  ): Promise<boolean> => {
    if (file.size > MAX_DOCUMENT_SIZE) {
      toast.error(
        `${file.name} is too large — max ${maxDocumentSizeLabel()} (got ${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
      );
      return false;
    }

    setIsRestoring(true);
    try {
      await apiRequest(`/documents/${doc.document_id}`, { method: "DELETE" });
      const large = isLargeBackgroundUpload(file);
      if (large) prepareUploadNotifications();
      await uploadAndIndexDocument(file, { waitForFullIndex: !large });
      await fetchDocs();
      notifyDocumentsChanged();
      if (large) {
        notifyBackgroundUploadStarted(file.name, file.size);
        toast.message("Restore uploaded — we'll notify you when indexing finishes.");
      } else {
        toast.success(`${file.name} is stored and ready for preview.`);
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      toast.error(msg);
      await fetchDocs({ silent: true });
      return false;
    } finally {
      setIsRestoring(false);
    }
  };

  return {
    docs,
    isLoading,
    fetchDocs,
    uploadQueue,
    isQueueActive: uploadQueue.length > 0,
    enqueueFiles,
    handleInputChange,
    handleDirInputChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    isDragging,
    fileInputRef,
    dirInputRef,
    docToDelete,
    setDocToDelete,
    confirmDelete,
    doneCount: uploadQueue.filter((i) => i.status === "done").length,
    totalCount: uploadQueue.length,
    openFilePicker,
    restoreLegacyDocument,
    isRestoring,
  };
}
