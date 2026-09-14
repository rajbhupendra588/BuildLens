"use client";

import {
  Bot,
  Database,
  Palette,
  Search,
  type LucideIcon,
} from "lucide-react";
import { AiProvidersSettings } from "@/components/settings/ai-providers-settings";
import { RagSettings } from "@/components/settings/rag-settings";
import { StorageSettings } from "@/components/settings/storage-settings";
import { PreferencesSettings } from "@/components/settings/preferences-settings";
import { cn } from "@/lib/utils";

const SETTINGS_SECTIONS = [
  {
    id: "ai-providers",
    title: "AI Providers",
    description: "Ollama URL, cloud API keys, default model",
    icon: Bot,
  },
  {
    id: "rag",
    title: "RAG Retrieval",
    description: "Top-K results and similarity threshold",
    icon: Search,
  },
  {
    id: "storage",
    title: "Storage",
    description: "Indexed files, chunks, and data cleanup",
    icon: Database,
  },
  {
    id: "preferences",
    title: "Preferences",
    description: "Theme, export, and import chat history",
    icon: Palette,
  },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}>;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SettingsNavTile({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-colors",
        "hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border bg-muted/50">
        <Icon className="size-5 text-primary" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </button>
  );
}

export function SettingsPageContent() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Configure LLM providers, retrieval behavior, storage, and app
          preferences. Pick a section below or scroll through the page.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SETTINGS_SECTIONS.map((section) => (
          <SettingsNavTile
            key={section.id}
            title={section.title}
            description={section.description}
            icon={section.icon}
            onClick={() => scrollToSection(section.id)}
          />
        ))}
      </div>

      <section id="ai-providers" className="scroll-mt-6">
        <AiProvidersSettings />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="rag" className="scroll-mt-6">
          <RagSettings />
        </section>
        <section id="storage" className="scroll-mt-6">
          <StorageSettings />
        </section>
      </div>

      <section id="preferences" className="scroll-mt-6">
        <PreferencesSettings />
      </section>
    </div>
  );
}
