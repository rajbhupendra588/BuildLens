"use client";

import { useEffect, useState } from "react";
import { Bot, ChevronDown, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [models, setModels] = useState<ModelItem[] | null>(null);

  const isLoading = models === null;

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
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground font-normal max-w-[280px]"
        >
          <Bot className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="max-h-[min(60vh,24rem)] w-72 overflow-y-auto p-1"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-4 animate-spin mr-2" />
            <span className="text-sm">Loading models…</span>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-2">
            No models available. Check your Ollama connection or API keys.
          </p>
        ) : (
          Object.entries(grouped).map(([provider, items], groupIndex) => (
            <div key={provider}>
              {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {PROVIDER_LABELS[provider] ?? provider}
              </DropdownMenuLabel>
              {items.map((item) => {
                const isActive =
                  item.provider === selectedProvider &&
                  item.name === selectedModel;
                const enabled = isSelectable(item);
                return (
                  <button
                    key={`${item.provider}:${item.name}`}
                    type="button"
                    onClick={() => handleSelect(item)}
                    disabled={!enabled}
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none",
                      enabled && "hover:bg-accent hover:text-accent-foreground",
                      !enabled && "opacity-40 cursor-not-allowed",
                      isActive && "bg-primary/5 text-primary font-medium",
                    )}
                  >
                    <span className="truncate pr-2">{item.name}</span>
                    {isActive ? (
                      <Check className="size-3.5 shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
