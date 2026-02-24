import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AiProvidersSettings } from "@/components/settings/ai-providers-settings";
import { RagSettings } from "@/components/settings/rag-settings";
import { StorageSettings } from "@/components/settings/storage-settings";
import { PreferencesSettings } from "@/components/settings/preferences-settings";

export default function SettingsPage() {
  return (
    <SidebarInset className="flex flex-col h-screen">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <AiProvidersSettings />
          <RagSettings />
          <StorageSettings />
          <PreferencesSettings />
        </div>
      </div>
    </SidebarInset>
  );
}
