import { SidebarInset } from "@/components/ui/sidebar";
import { SettingsPageContent } from "@/components/settings/settings-page-content";
import { UserMenu } from "@/components/auth/user-menu";

export default function SettingsPage() {
  return (
    <SidebarInset className="flex h-svh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 md:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-semibold tracking-tight">Settings</h1>
          <p className="text-xs text-muted-foreground">
            Manage providers, retrieval, storage, and preferences
          </p>
        </div>
        <UserMenu />
      </header>

      <div className="flex-1 overflow-y-auto">
        <SettingsPageContent />
      </div>
    </SidebarInset>
  );
}
