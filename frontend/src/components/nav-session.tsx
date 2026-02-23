"use client";

import { useChatStore } from "@/hooks/use-chat-store";
import { ChatSession } from "@/types/chat";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
} from "./ui/sidebar";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

export function NavSessions({ sessions }: { sessions: ChatSession[] }) {
  const { currentSessionId, setCurrentSessionId } = useChatStore();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
      <SidebarMenu>
        {sessions.map((session) => (
          <SidebarMenuButton
            onClick={() => setCurrentSessionId(session.id)}
            className={
              cn(currentSessionId === session.id) && "bg-sidebar-accent"
            }
          >
            <MessageSquare className="size-4" />
            <span className="truncate">{session.title}</span>
          </SidebarMenuButton>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
