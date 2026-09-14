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
import { Library, Plus, Settings, SquarePen } from "lucide-react";
import { NavSessions } from "./nav-session";
import { useChatStore } from "@/hooks/use-chat-store";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

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
      <Sidebar variant="sidebar" collapsible="icon">
        <SidebarHeader className="gap-3 p-2">
          <div className="flex items-center justify-between gap-1 px-1 group-data-[collapsible=icon]:justify-center">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <SquarePen className="size-4" />
              </div>
              <span className="truncate text-sm font-semibold">BuildLens</span>
            </Link>
            <SidebarTrigger className="shrink-0" />
          </div>

          <div className="px-0.5 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleCreateSession}
              className={cn(
                "h-9 w-full justify-start gap-2 rounded-lg border-sidebar-border bg-sidebar shadow-none",
                "font-normal hover:bg-sidebar-accent",
                "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
              )}
            >
              <Plus className="size-4 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">New chat</span>
            </Button>
          </div>

          <div className="group-data-[collapsible=icon]:hidden">
            <SidebarInput
              placeholder="Search chats…"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              className="h-8 bg-sidebar-accent/50 shadow-none"
            />
          </div>

          <SidebarMenu className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
              <SidebarMenuButton
                asChild
                tooltip="Library"
                isActive={pathname === "/library"}
              >
                <Link href="/library">
                  <Library className="size-4" />
                  <span>Library</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="gap-2">
          <NavSessions sessions={sessions} searchQuery={chatSearch} />
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Settings"
                isActive={pathname === "/settings"}
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
