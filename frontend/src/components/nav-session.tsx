"use client";

import { ChatSession } from "@/types/chat";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "./ui/sidebar";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { SessionActions } from "./chat/session-actions";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

export function NavSessions({
  sessions,
  searchQuery = "",
}: {
  sessions: ChatSession[];
  searchQuery?: string;
}) {
  const pathname = usePathname();

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  return (
    <SidebarGroup className="min-h-0 flex-1">
      <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
        Chats
      </SidebarGroupLabel>
      <SidebarGroupContent className="min-h-0">
        <SidebarMenu>
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {searchQuery.trim()
                ? "No chats match your search."
                : "No conversations yet. Start a new chat."}
            </p>
          ) : (
            filtered.map((session, index) => {
              const isActive = pathname === `/chat/${session.id}`;
              return (
                <SidebarMenuItem key={session.id ?? index}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={session.title}
                    className="h-9 font-normal"
                  >
                    <Link href={`/chat/${session.id}`}>
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
            })
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
