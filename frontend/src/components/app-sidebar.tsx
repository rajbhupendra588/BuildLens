"use client";

import { apiRequest, logApiError } from "@/lib/api";
import { ChatSession } from "@/types/chat";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "./ui/sidebar";
import { Plus, Settings } from "lucide-react";
import { useChatStore } from "@/hooks/use-chat-store";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { NavigationSidebarSections } from "./enterprise-chat/navigation-sidebar-sections";
import { ConversationList } from "./enterprise-chat/conversation-list";

export function AppSidebar() {
  const { addSession, setSessions, sessions } = useChatStore();
  const router = useRouter();
  const pathname = usePathname();
  const [chatSearch, setChatSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    apiRequest<ChatSession[]>("/chat/sessions")
      .then((data) => {
        if (!cancelled) setSessions(data);
      })
      .catch((error) => {
        logApiError("Failed to load sessions", error);
      });

    return () => {
      cancelled = true;
    };
  }, [setSessions]);

  const handleCreateSession = async () => {
    try {
      const newSession = await apiRequest<ChatSession>("/chat/sessions", {
        method: "POST",
      });
      addSession(newSession);
      router.push(`/chat/${newSession.id}`);
    } catch (error) {
      logApiError("Create session failed", error);
    }
  };

  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      className="border-r border-border bg-[var(--enterprise-surface)]"
    >
      <SidebarHeader className="gap-2 p-2">
        <div className="flex items-center justify-between gap-1 px-1 group-data-[collapsible=icon]:justify-center">
          <Link
            href="/app"
            className="flex min-w-0 flex-col gap-0 group-data-[collapsible=icon]:hidden"
          >
            <span className="truncate text-[15px] font-semibold tracking-tight">
              BuildLens
            </span>
            <span className="text-[11px] text-muted-foreground truncate">
              Document intelligence
            </span>
          </Link>
          <SidebarTrigger className="shrink-0" />
        </div>

        <div className="px-0.5 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleCreateSession}
            className={cn(
              "h-9 w-full justify-start gap-2 rounded-md border-border bg-[var(--enterprise-elevated)] shadow-none",
              "text-[13px] font-normal hover:bg-muted/40",
              "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
            )}
          >
            <Plus className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">New chat</span>
          </Button>
        </div>

        <div className="group-data-[collapsible=icon]:hidden">
          <SidebarInput
            placeholder="Search conversations…"
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            className="h-8 bg-[var(--enterprise-bg)]/60 shadow-none text-[13px]"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1 overflow-y-auto">
        <NavigationSidebarSections />
        <div className="px-2 pt-2 group-data-[collapsible=icon]:hidden">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Recent conversations
          </p>
        </div>
        <ConversationList sessions={sessions} searchQuery={chatSearch} />
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Settings"
              isActive={pathname === "/settings"}
              className="text-[13px]"
            >
              <Link href="/settings">
                <Settings className="size-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
