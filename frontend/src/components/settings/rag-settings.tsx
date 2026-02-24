"use client";

import { Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/hooks/use-chat-store";

export function RagSettings() {
  const { ragTopK, ragThreshold, setRagTopK, setRagThreshold } = useChatStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle>RAG Retrieval</CardTitle>
        <CardDescription>
          Tune how documents are retrieved for each query.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Top-K */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Top-K Results</label>
          <p className="text-xs text-muted-foreground">
            Number of document chunks retrieved per query (1–20).
          </p>
          <Input
            type="number"
            min={1}
            max={20}
            step={1}
            value={ragTopK}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1 && v <= 20) setRagTopK(v);
            }}
            className="w-28"
          />
        </div>

        {/* Similarity threshold */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Similarity Threshold</label>
          <p className="text-xs text-muted-foreground">
            Minimum cosine similarity score for a chunk to be included (0.0–1.0).
          </p>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={ragThreshold}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v >= 0 && v <= 1) setRagThreshold(v);
            }}
            className="w-28"
          />
        </div>

        {/* Info card */}
        <div className="flex gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="size-3.5 mt-0.5 shrink-0" />
          <span>
            System uses <strong>HybridChunker</strong> (512 tokens max) with
            character split fallback. Custom chunking strategy coming soon.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
