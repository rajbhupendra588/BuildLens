"use client";

import { useEffect, useState } from "react";
import { Database, MessageSquare, RefreshCw, Trash2 } from "lucide-react";
import { LibraryAskDialog } from "@/components/library/library-ask-dialog";
import { LibraryDocument } from "@/types/document";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { FileIcon } from "@/components/library/file-icon";
import { UploadDropzone } from "@/components/library/upload-dropzone";
import { useDocumentLibrary } from "@/hooks/use-document-library";
import { OPEN_DOCUMENT_LIBRARY_EVENT } from "@/lib/document-library-events";
import { cn } from "@/lib/utils";

export function KnowledgeBase({
  showMenuTrigger = true,
}: {
  showMenuTrigger?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [askDoc, setAskDoc] = useState<LibraryDocument | null>(null);
  const library = useDocumentLibrary();

  useEffect(() => {
    const open = () => setDialogOpen(true);
    window.addEventListener(OPEN_DOCUMENT_LIBRARY_EVENT, open);
    return () => window.removeEventListener(OPEN_DOCUMENT_LIBRARY_EVENT, open);
  }, []);

  return (
    <>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (open) void library.fetchDocs();
        }}
      >
        {showMenuTrigger ? (
          <DialogTrigger asChild>
            <SidebarMenuButton tooltip="Library">
              <div className="flex cursor-pointer items-center gap-2">
                <Database className="size-4" />
                <span>Library</span>
              </div>
            </SidebarMenuButton>
          </DialogTrigger>
        ) : null}

        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b bg-muted/30 p-6">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Database className="size-5 text-primary" />
              </div>
              <div>
                <DialogTitle>Library</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {library.docs.length} uploaded file
                  {library.docs.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void library.fetchDocs()}
              disabled={library.isLoading}
              className="h-8"
            >
              <RefreshCw
                className={cn("mr-2 size-3.5", library.isLoading && "animate-spin")}
              />
              Sync
            </Button>
          </div>

          <div className="border-b bg-background p-4">
            <UploadDropzone
              compact
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
          </div>

          <div className="flex-1 overflow-auto p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead className="w-[100px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {library.docs.length === 0 && !library.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="py-12 text-center text-muted-foreground"
                    >
                      Upload a file to see it in your library.
                    </TableCell>
                  </TableRow>
                ) : (
                  library.docs.map((doc) => (
                    <TableRow key={doc.document_id} className="group">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileIcon name={doc.file_name} />
                          <span className="max-w-[380px] truncate">
                            {doc.file_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            title="Ask about this file"
                            onClick={() => setAskDoc(doc)}
                          >
                            <MessageSquare className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => library.setDocToDelete(doc)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <LibraryAskDialog
        doc={askDoc}
        onOpenChange={(open) => !open && setAskDoc(null)}
      />

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
    </>
  );
}
