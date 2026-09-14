"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiRequest, isTransientNetworkError } from "@/lib/api";
import { uploadAndIndexDocument } from "@/lib/document-upload";
import { collectFilesFromDataTransfer } from "@/lib/collect-dropped-files";
import { DOCUMENTS_CHANGED_EVENT, notifyDocumentsChanged } from "@/lib/document-library-events";
import { MAX_DOCUMENT_SIZE, maxDocumentSizeLabel } from "@/lib/document-upload";
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
      const sorted = [...response.documents].sort((a, b) =>
        a.file_name.localeCompare(b.file_name, undefined, {
          sensitivity: "base",
        }),
      );
      setDocs(sorted);
      return true;
    } catch (error) {
      if (!options?.silent) {
        const hint = isTransientNetworkError(error)
          ? "The API is busy indexing—try Refresh in a moment."
          : "Could not load the document library.";
        console.warn(hint, error);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) enqueueFiles(files);
    e.target.value = "";
  };

  const handleDirInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) enqueueFiles(files);
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
      await uploadAndIndexDocument(file);
      await fetchDocs();
      notifyDocumentsChanged();
      toast.success(`${file.name} is stored and ready for preview.`);
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
