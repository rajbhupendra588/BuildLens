"use client";

import { useChatStore } from "@/hooks/use-chat-store";
import { ChatSession } from "@/types/chat";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "./ui/sidebar";
import { cn } from "@/lib/utils";
import { MessageSquare, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { SessionActions } from "./chat/session-actions";

export function NavSessions({ sessions }: { sessions: ChatSession[] }) {
  const { currentSessionId, setCurrentSessionId } = useChatStore();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
      <SidebarMenu>
        {sessions.map((session, index) => (
          <SidebarMenuItem key={session.id ?? index}>
            <SidebarMenuButton
              onClick={() => setCurrentSessionId(session.id)}
              className={cn(
                currentSessionId === session.id && "bg-sidebar-accent",
              )}
            >
              <MessageSquare className="size-4" />
              <span className="truncate">{session.title}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover>
                  <MoreHorizontal />
                </SidebarMenuAction>
              </DropdownMenuTrigger>

              <SessionActions
                sessionId={session.id}
                initialTitle={session.title}
              />
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
