"use client";

import { useEffect, useState } from "react";
import { fetchDocumentBlob, logApiError } from "@/lib/api";

export function useAuthenticatedDocumentUrl(
  documentId: string | null | undefined,
  enabled = true,
) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId || !enabled) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);

    fetchDocumentBlob(documentId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        logApiError("Document preview fetch failed", err);
        setError(
          err instanceof Error ? err.message : "Could not load document",
        );
        setUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, enabled]);

  return { url, loading, error };
}
