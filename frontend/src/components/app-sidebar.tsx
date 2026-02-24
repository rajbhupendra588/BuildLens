"use client";
import { apiRequest } from "@/lib/api";
import { ChatSession } from "@/types/chat";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";
import { Plus, Settings } from "lucide-react";
import { NavSessions } from "./nav-session";
import { useChatStore } from "@/hooks/use-chat-store";
import { useEffect } from "react";
import { KnowledgeBase } from "./chat/knowledge-base";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function AppSidebar() {
  const { addSession, setSessions, sessions } = useChatStore();
  const router = useRouter();

  useEffect(() => {
    apiRequest<ChatSession[]>("/chat/sessions").then(setSessions);
  }, [setSessions]);

  const handleCreateSession = async () => {
    try {
      const newSession = await apiRequest<ChatSession>("/chat/sessions", {
        method: "POST",
      });
      addSession(newSession);
      router.push(`/chat/${newSession.id}`);
    } catch (error) {
      console.error("Create session failed", error);
    }
  };

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 font-semibold">
          <span className="truncate">DocRAG Engine</span>
        </div>
        <KnowledgeBase />

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/50 transition-colors cursor-pointer"
              onClick={handleCreateSession}
            >
              <Plus className="size-5" />
              <span>New Chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavSessions sessions={sessions} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/settings">
                <Settings className="size-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="p-2 text-xs text-muted-foreground text-center">
          DocRAG v0.1.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
