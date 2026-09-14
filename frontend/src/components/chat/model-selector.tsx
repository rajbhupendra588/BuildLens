"use client";

import { useEffect, useState } from "react";
import { Bot, ChevronDown, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api";
import { ModelItem, ModelsResponse } from "@/types/chat";
import { useChatStore } from "@/hooks/use-chat-store";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_PROVIDER,
  isChatPanelModel,
} from "@/lib/chat-models";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  ollama: "Ollama (Local)",
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Anthropic",
};

const PROVIDER_ORDER = ["openrouter", "ollama", "openai", "gemini", "anthropic"];

interface ModelSelectorProps {
  /** Chat panel only lists OpenRouter allowlisted models; Settings can show all. */
  restrictToChatModels?: boolean;
}

export function ModelSelector({ restrictToChatModels = true }: ModelSelectorProps) {
  const {
    selectedProvider,
    selectedModel,
    setSelectedProvider,
    setSelectedModel,
  } = useChatStore();

  const [open, setOpen] = useState(false);
  // null = fetch in progress, [] = loaded with no results, [...] = loaded with data
  const [models, setModels] = useState<ModelItem[] | null>(null);

  // Derived — no separate isLoading state needed
  const isLoading = open && models === null;

  // Prefetch models on mount so the dialog opens instantly
  useEffect(() => {
    apiRequest<ModelsResponse>("/models/")
      .then((res) => {
        const all = [...res.local, ...res.cloud];
        setModels(all);

        const { selectedProvider: provider, selectedModel: model } =
          useChatStore.getState();
        const chatSelectionInvalid =
          !model ||
          (restrictToChatModels &&
            (provider !== DEFAULT_CHAT_PROVIDER || !isChatPanelModel(model)));
        const onSlowDefault =
          restrictToChatModels &&
          model === "nvidia/nemotron-3-ultra-550b-a55b:free";
        if (chatSelectionInvalid || onSlowDefault) {
          setSelectedProvider(DEFAULT_CHAT_PROVIDER);
          setSelectedModel(DEFAULT_CHAT_MODEL);
        }
      })
      .catch(() => setModels([]));
  }, [restrictToChatModels, setSelectedProvider, setSelectedModel]);

  const handleSelect = (item: ModelItem) => {
    if (restrictToChatModels && !isChatPanelModel(item.name)) return;
    setSelectedProvider(item.provider);
    setSelectedModel(item.name);
    setOpen(false);
  };

  const isSelectable = (item: ModelItem) =>
    !restrictToChatModels || isChatPanelModel(item.name);

  // Group models by provider in a defined order
  const grouped = PROVIDER_ORDER.reduce<Record<string, ModelItem[]>>(
    (acc, provider) => {
      const items = (models ?? []).filter((m) => m.provider === provider);
      if (items.length > 0) acc[provider] = items;
      return acc;
    },
    {},
  );

  const displayLabel = selectedModel
    ? `${PROVIDER_LABELS[selectedProvider] ?? selectedProvider} · ${selectedModel}`
    : "Select a model";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground font-normal max-w-[280px]"
        >
          <Bot className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle className="text-sm font-medium">
            Select Model
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin mr-2" />
              <span className="text-sm">Loading models…</span>
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              No models available. Check your Ollama connection or API keys.
            </p>
          ) : (
            Object.entries(grouped).map(([provider, items]) => (
              <div key={provider}>
                {/* Provider section header */}
                <div className="px-4 py-2 bg-muted/40 border-b">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {PROVIDER_LABELS[provider] ?? provider}
                  </p>
                </div>

                {/* Model rows */}
                {items.map((item) => {
                  const isActive =
                    item.provider === selectedProvider &&
                    item.name === selectedModel;
                  const enabled = isSelectable(item);
                  return (
                    <button
                      key={`${item.provider}:${item.name}`}
                      onClick={() => handleSelect(item)}
                      disabled={!enabled}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-2.5 text-sm text-left",
                        enabled &&
                          "hover:bg-accent hover:text-accent-foreground transition-colors",
                        !enabled && "opacity-40 cursor-not-allowed",
                        isActive && "bg-primary/5 text-primary font-medium",
                      )}
                    >
                      <span className="truncate">{item.name}</span>
                      {isActive && <Check className="size-3.5 shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
