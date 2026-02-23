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
import { Plus } from "lucide-react";
import { NavSessions } from "./nav-session";

export async function AppSidebar() {
  let sessions: ChatSession[] = [];

  try {
    sessions = await apiRequest<ChatSession[]>("/chat/sessions");
  } catch (error) {
    console.error("Failed to fetch sessions", error);
  }

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/50 cursor-pointer"
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
        <div className="p-4 text-xs text-muted-foreground text-center">
          DocRAG v0.1.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
