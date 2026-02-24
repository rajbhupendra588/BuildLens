"use client";

import { ChatSession } from "@/types/chat";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "./ui/sidebar";
import { MessageSquare, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { SessionActions } from "./chat/session-actions";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavSessions({ sessions }: { sessions: ChatSession[] }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
      <SidebarMenu>
        {sessions.map((session, index) => {
          const isActive = pathname === `/chat/${session.id}`;
          return (
            <SidebarMenuItem key={session.id ?? index}>
              <SidebarMenuButton asChild isActive={isActive}>
                <Link href={`/chat/${session.id}`}>
                  <MessageSquare className="size-4" />
                  <span className="truncate">{session.title}</span>
                </Link>
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
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
