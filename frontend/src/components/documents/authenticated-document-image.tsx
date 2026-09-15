"use client";

import { useAuthenticatedDocumentUrl } from "@/hooks/use-authenticated-document-url";
import { cn } from "@/lib/utils";

export function AuthenticatedDocumentImage({
  documentId,
  alt,
  className,
  loadingClassName,
}: {
  documentId: string;
  alt: string;
  className?: string;
  loadingClassName?: string;
}) {
  const { url, loading, error } = useAuthenticatedDocumentUrl(documentId);

  if (loading) {
    return (
      <div
        className={cn(
          "animate-pulse bg-muted/50",
          loadingClassName ?? className,
        )}
        aria-hidden
      />
    );
  }

  if (error || !url) {
    return (
      <p className="p-2 text-center text-xs text-muted-foreground">
        Preview unavailable
      </p>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} loading="lazy" />
  );
}
