"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eye,
  LayoutGrid,
  List,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FileIcon } from "@/components/library/file-icon";
import { UploadDropzone } from "@/components/library/upload-dropzone";
import { useDocumentLibrary } from "@/hooks/use-document-library";
import { fetchDocumentBlob } from "@/lib/api";
import { AuthenticatedDocumentImage } from "@/components/documents/authenticated-document-image";
import { DocumentPreviewPane } from "@/components/documents/document-preview-pane";
import { formatFileSize, isImageFileName } from "@/lib/collect-dropped-files";
import { cn } from "@/lib/utils";
import { LibraryAskDialog } from "@/components/library/library-ask-dialog";
import { LibraryListControls } from "@/components/library/library-list-controls";
import { UserMenu } from "@/components/auth/user-menu";
import { MAX_LIBRARY_FILES, maxDocumentSizeLabel } from "@/lib/document-upload";
import {
  filterLibraryDocuments,
  formatLibraryDate,
  LibraryKindFilter,
  LibrarySortKey,
  libraryFileKind,
  LIBRARY_KIND_FILTERS,
  LIBRARY_SORT_OPTIONS,
  sortLibraryDocuments,
} from "@/lib/library-document-utils";
import { LibraryDocument } from "@/types/document";

const LIBRARY_SORT_STORAGE = "buildlens-library-sort";
const LIBRARY_KIND_STORAGE = "buildlens-library-kind-filter";

function loadStoredSort(): LibrarySortKey {
  if (typeof window === "undefined") return "date-desc";
  const raw = localStorage.getItem(LIBRARY_SORT_STORAGE);
  if (LIBRARY_SORT_OPTIONS.some((o) => o.value === raw)) {
    return raw as LibrarySortKey;
  }
  return "date-desc";
}

function loadStoredKindFilter(): LibraryKindFilter {
  if (typeof window === "undefined") return "all";
  const raw = localStorage.getItem(LIBRARY_KIND_STORAGE);
  if (LIBRARY_KIND_FILTERS.includes(raw as LibraryKindFilter)) {
    return raw as LibraryKindFilter;
  }
  return "all";
}

export function DocumentLibrary() {
  const library = useDocumentLibrary();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [previewDoc, setPreviewDoc] = useState<LibraryDocument | null>(null);
  const [legacyDoc, setLegacyDoc] = useState<LibraryDocument | null>(null);
  const [askDoc, setAskDoc] = useState<LibraryDocument | null>(null);
  const [sortKey, setSortKey] = useState<LibrarySortKey>(loadStoredSort);
  const [kindFilter, setKindFilter] =
    useState<LibraryKindFilter>(loadStoredKindFilter);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const restoreTargetRef = useRef<LibraryDocument | null>(null);

  useEffect(() => {
    localStorage.setItem(LIBRARY_SORT_STORAGE, sortKey);
  }, [sortKey]);

  useEffect(() => {
    localStorage.setItem(LIBRARY_KIND_STORAGE, kindFilter);
  }, [kindFilter]);

  const legacyCount = useMemo(
    () => library.docs.filter((d) => !d.has_file).length,
    [library.docs],
  );

  const displayedDocs = useMemo(() => {
    const filtered = filterLibraryDocuments(
      library.docs,
      query,
      kindFilter,
    );
    return sortLibraryDocuments(filtered, sortKey);
  }, [library.docs, query, kindFilter, sortKey]);

  const openPreview = (doc: LibraryDocument) => {
    if (!doc.has_file) {
      setLegacyDoc(doc);
      return;
    }
    setPreviewDoc(doc);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b bg-card/80 backdrop-blur-sm supports-[backdrop-filter]:bg-card/60">
        <div className="flex flex-col gap-3 px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">Library</h1>
              <p className="text-sm text-muted-foreground">
                {library.isLoading && library.docs.length === 0
                  ? "Loading uploaded files…"
                  : `${library.docs.length} of ${MAX_LIBRARY_FILES} files · ${maxDocumentSizeLabel()} each`}
                {(query.trim() || kindFilter !== "all") &&
                  ` · ${displayedDocs.length} shown`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-lg border p-0.5 sm:flex">
                <Button
                  type="button"
                  variant={view === "grid" ? "secondary" : "ghost"}
                  size="icon-sm"
                  title="Grid view"
                  onClick={() => setView("grid")}
                >
                  <LayoutGrid className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant={view === "list" ? "secondary" : "ghost"}
                  size="icon-sm"
                  title="List view"
                  onClick={() => setView("list")}
                >
                  <List className="size-3.5" />
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void library.fetchDocs()}
                disabled={library.isLoading}
              >
                <RefreshCw
                  className={cn(
                    "size-3.5 mr-2",
                    library.isLoading && "animate-spin",
                  )}
                />
                Refresh
              </Button>
              <UserMenu />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, kind, or extension…"
                className="pl-8"
              />
            </div>
            <LibraryListControls
              sortKey={sortKey}
              onSortChange={setSortKey}
              kindFilter={kindFilter}
              onKindFilterChange={setKindFilter}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6">
          {legacyCount > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              <p className="font-medium">
                {legacyCount} file{legacyCount === 1 ? "" : "s"} indexed for chat
                without a stored original
              </p>
              <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
                Open a file and use <strong>Restore file</strong>, or pick the
                same file from disk in the dialog. New uploads keep the original
                automatically.
              </p>
            </div>
          ) : null}

          <UploadDropzone
            isDragging={library.isDragging}
            isQueueActive={library.isQueueActive}
            uploadQueue={library.uploadQueue}
            doneCount={library.doneCount}
            totalCount={library.totalCount}
            fileInputRef={library.fileInputRef}
            dirInputRef={library.dirInputRef}
            onDragOver={library.handleDragOver}
            onDragLeave={library.handleDragLeave}
            onDrop={library.handleDrop}
            onInputChange={library.handleInputChange}
            onDirInputChange={library.handleDirInputChange}
            onOpenFilePicker={library.openFilePicker}
          />

          {library.isLoading && library.docs.length === 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : displayedDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
              <UploadCloud className="mb-3 size-10 text-muted-foreground/50" />
              <p className="text-sm font-medium">
                {library.docs.length === 0
                  ? "No files in your library yet"
                  : "No files match your search or filters"}
              </p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                {library.docs.length === 0
                  ? "Upload PDFs, spreadsheets, images, or folders. Everything you index appears here."
                  : "Try another search term or reset the kind filter."}
              </p>
            </div>
          ) : view === "grid" ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayedDocs.map((doc) => (
                <li key={doc.document_id}>
                  <LibraryFileCard
                    doc={doc}
                    onPreview={() => openPreview(doc)}
                    onAsk={() => setAskDoc(doc)}
                    onDelete={() => library.setDocToDelete(doc)}
                    onRestore={() => {
                      restoreTargetRef.current = doc;
                      setLegacyDoc(doc);
                      restoreInputRef.current?.click();
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead className="hidden sm:table-cell">Kind</TableHead>
                    <TableHead className="hidden md:table-cell">Added</TableHead>
                    <TableHead className="hidden lg:table-cell">Size</TableHead>
                    <TableHead className="hidden xl:table-cell">
                      Chunks
                    </TableHead>
                    <TableHead className="w-[148px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedDocs.map((doc) => (
                    <TableRow key={doc.document_id} className="group">
                      <TableCell className="font-medium">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileIcon name={doc.file_name} />
                          <span className="truncate" title={doc.file_name}>
                            {doc.file_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {libraryFileKind(doc.file_name)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {formatLibraryDate(doc.uploaded_at)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {formatFileSize(doc.file_size)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">
                        {doc.chunk_count ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <FileActions
                          doc={doc}
                          onPreview={() => openPreview(doc)}
                          onAsk={() => setAskDoc(doc)}
                          onDelete={() => library.setDocToDelete(doc)}
                          onRestore={() => {
                            restoreTargetRef.current = doc;
                            setLegacyDoc(doc);
                            restoreInputRef.current?.click();
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={!!library.docToDelete}
        onOpenChange={(open) => !open && library.setDocToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will erase all knowledge associated with{" "}
              <b>{library.docToDelete?.file_name}</b>. The AI will no longer
              answer questions based on this file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void library.confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LibraryAskDialog
        doc={askDoc}
        onOpenChange={(open) => !open && setAskDoc(null)}
      />

      <FilePreviewDialog
        doc={previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        onChat={(doc) => {
          setPreviewDoc(null);
          setAskDoc(doc);
        }}
      />

      <Dialog
        open={!!legacyDoc}
        onOpenChange={(open) => !open && setLegacyDoc(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Original file not stored</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">
              {legacyDoc?.file_name}
            </span>{" "}
            is still indexed for chat
            {legacyDoc?.chunk_count != null
              ? ` (${legacyDoc.chunk_count} chunks)`
              : ""}
            , but BuildLens does not have the uploaded bytes on disk—usually
            because it was added before file storage was enabled.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Choose the same file from your computer. BuildLens will remove the
            old index entry, store the original on disk, and re-index it for
            chat—preview and download will work afterward.
          </p>
          <input
            ref={restoreInputRef}
            type="file"
            className="hidden"
            accept={
              legacyDoc?.file_name.includes(".")
                ? `.${legacyDoc.file_name.split(".").pop()?.toLowerCase()}`
                : undefined
            }
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              const target = restoreTargetRef.current ?? legacyDoc;
              if (!file || !target) return;
              const ok = await library.restoreLegacyDocument(target, file);
              if (ok) {
                restoreTargetRef.current = null;
                setLegacyDoc(null);
              }
            }}
          />
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setLegacyDoc(null)}>
              Close
            </Button>
            {legacyDoc ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAskDoc(legacyDoc);
                    setLegacyDoc(null);
                  }}
                >
                  <MessageSquare className="mr-2 size-4" />
                  Chat about this file
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    library.setDocToDelete(legacyDoc);
                    setLegacyDoc(null);
                  }}
                >
                  Remove only
                </Button>
                <Button
                  disabled={library.isRestoring}
                  onClick={() => {
                    if (legacyDoc) restoreTargetRef.current = legacyDoc;
                    restoreInputRef.current?.click();
                  }}
                >
                  {library.isRestoring ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Choose file to restore
                </Button>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FileActions({
  doc,
  onPreview,
  onAsk,
  onDelete,
  onRestore,
}: {
  doc: LibraryDocument;
  onPreview: () => void;
  onAsk: () => void;
  onDelete: () => void;
  onRestore?: () => void;
}) {
  return (
    <div className="flex justify-end gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-primary"
        title="Ask about this file"
        onClick={onAsk}
      >
        <MessageSquare className="size-4" />
      </Button>
      {!doc.has_file && onRestore ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-amber-700 hover:text-amber-800 dark:text-amber-400"
          title="Restore file from disk"
          onClick={onRestore}
        >
          <Upload className="size-4" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        title={doc.has_file ? "Preview" : "Indexed only — restore to preview"}
        disabled={!doc.has_file}
        onClick={onPreview}
      >
        <Eye className="size-4" />
      </Button>
      {doc.has_file ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Download"
          type="button"
          onClick={() => {
            void fetchDocumentBlob(doc.document_id).then((blob) => {
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = doc.file_name;
              anchor.click();
              URL.revokeObjectURL(url);
            });
          }}
        >
          <Download className="size-4" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        title="Remove"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function LibraryFileCard({
  doc,
  onPreview,
  onAsk,
  onDelete,
  onRestore,
}: {
  doc: LibraryDocument;
  onPreview: () => void;
  onAsk: () => void;
  onDelete: () => void;
  onRestore?: () => void;
}) {
  const showThumb = Boolean(doc.has_file && isImageFileName(doc.file_name));

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-colors hover:border-primary/30">
      <button
        type="button"
        onClick={onPreview}
        className={cn(
          "relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/40",
          !doc.has_file && "cursor-default opacity-90",
        )}
        title={
          doc.has_file
            ? `Preview ${doc.file_name}`
            : `${doc.file_name} — indexed only (re-upload for preview)`
        }
      >
        {!doc.has_file ? (
          <span className="absolute left-2 top-2 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
            Indexed only
          </span>
        ) : null}
        {showThumb ? (
          <AuthenticatedDocumentImage
            documentId={doc.document_id}
            alt={doc.file_name}
            className="size-full object-cover"
            loadingClassName="size-full"
          />
        ) : (
          <FileIcon name={doc.file_name} className="size-10" />
        )}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={doc.file_name}>
            {doc.file_name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {libraryFileKind(doc.file_name)}
            {" · "}
            {formatLibraryDate(doc.uploaded_at)}
            {" · "}
            {formatFileSize(doc.file_size)}
            {doc.chunk_count != null ? ` · ${doc.chunk_count} chunks` : ""}
          </p>
        </div>
        <FileActions
          doc={doc}
          onPreview={onPreview}
          onAsk={onAsk}
          onDelete={onDelete}
          onRestore={onRestore}
        />
      </div>
    </article>
  );
}

function FilePreviewDialog({
  doc,
  onOpenChange,
  onChat,
}: {
  doc: LibraryDocument | null;
  onOpenChange: (open: boolean) => void;
  onChat: (doc: LibraryDocument) => void;
}) {
  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle className="min-w-0 flex-1 truncate text-left">
              {doc?.file_name ?? "Preview"}
            </DialogTitle>
            {doc ? (
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                onClick={() => onChat(doc)}
              >
                <MessageSquare className="mr-2 size-4" />
                Chat about this file
              </Button>
            ) : null}
          </div>
        </DialogHeader>
        {doc ? (
          <DocumentPreviewPane
            documentId={doc.document_id}
            fileName={doc.file_name}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
