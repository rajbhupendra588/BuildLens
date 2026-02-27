"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { AppSettings } from "@/types/settings";
import { toast } from "sonner";

async function saveRagSetting(key: string, value: string) {
  await apiRequest("/settings", {
    method: "PUT",
    body: JSON.stringify({ settings: { [key]: value } }),
  });
}

export function RagSettings() {
  const [topK, setTopK] = useState(5);
  const [threshold, setThreshold] = useState(0.3);

  useEffect(() => {
    apiRequest<AppSettings>("/settings").then((data) => {
      if (data["rag_top_k"]) setTopK(parseInt(data["rag_top_k"] as string, 10));
      if (data["rag_score_threshold"]) setThreshold(parseFloat(data["rag_score_threshold"] as string));
    });
  }, []);

  const handleTopKBlur = async () => {
    try {
      await saveRagSetting("rag_top_k", String(topK));
      toast.success("Top-K saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  const handleThresholdBlur = async () => {
    try {
      await saveRagSetting("rag_score_threshold", String(threshold));
      toast.success("Threshold saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>RAG Retrieval</CardTitle>
        <CardDescription>
          Tune how documents are retrieved for each query.
          Changes are saved when you leave the field.
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
            value={topK}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1 && v <= 20) setTopK(v);
            }}
            onBlur={handleTopKBlur}
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
            value={threshold}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v >= 0 && v <= 1) setThreshold(v);
            }}
            onBlur={handleThresholdBlur}
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
