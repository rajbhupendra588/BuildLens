"use client";

import { MediaAttachment } from "@/types/chat";
import { AuthenticatedDocumentImage } from "@/components/documents/authenticated-document-image";
import { cn } from "@/lib/utils";

export function MessageMediaGallery({
  media,
  className,
}: {
  media: MediaAttachment[];
  className?: string;
}) {
  if (!media?.length) return null;
  const visible = media.filter(
    (item) => item.media_type !== "document_report" && item.document_id,
  );
  if (!visible.length) return null;

  return (
    <div className={cn("mb-3 flex flex-col gap-3", className)}>
      {visible.map((item) => (
        <figure
          key={item.document_id}
          className="overflow-hidden rounded-xl border bg-muted/20"
        >
          {item.media_type === "image" ? (
            <AuthenticatedDocumentImage
              documentId={item.document_id!}
              alt={item.file_name ?? "Document"}
              className="max-h-[min(70vh,520px)] w-full object-contain bg-black/5 dark:bg-black/30"
            />
          ) : (
            <p className="block p-4 text-sm text-muted-foreground">
              Open this file from the document library preview.
            </p>
          )}
          <figcaption className="border-t px-3 py-2 text-xs text-muted-foreground truncate">
            {item.file_name}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
