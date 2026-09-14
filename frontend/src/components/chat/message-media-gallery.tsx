"use client";

import { MediaAttachment } from "@/types/chat";
import { documentFileUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export function MessageMediaGallery({
  media,
  className,
}: {
  media: MediaAttachment[];
  className?: string;
}) {
  if (!media?.length) return null;

  return (
    <div className={cn("mb-3 flex flex-col gap-3", className)}>
      {media.map((item) => {
        const src = documentFileUrl(item.document_id);
        return (
          <figure
            key={item.document_id}
            className="overflow-hidden rounded-xl border bg-muted/20"
          >
            {item.media_type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={item.file_name}
                className="max-h-[min(70vh,520px)] w-full object-contain bg-black/5 dark:bg-black/30"
                loading="lazy"
              />
            ) : (
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 text-sm text-primary underline"
              >
                Open {item.file_name}
              </a>
            )}
            <figcaption className="border-t px-3 py-2 text-xs text-muted-foreground truncate">
              {item.file_name}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
