"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ChatSession } from "@/types/chat";
import { groupConversations } from "@/lib/conversation-groups";
import { formatChatTime } from "@/lib/chat-time";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { MoreHorizontal, Pin } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SessionActions } from "@/components/chat/session-actions";
interface ConversationListProps {
  sessions: ChatSession[];
  searchQuery?: string;
}

export function ConversationList({
  sessions,
  searchQuery = "",
}: ConversationListProps) {
  const pathname = usePathname();
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? sessions.filter((s) => s.title.toLowerCase().includes(q))
    : sessions;

  const groups = groupConversations(filtered);

  if (filtered.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        {q ? "No conversations match your search." : "No conversations yet."}
      </p>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.key} className="py-0">
          <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden">
            {group.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.sessions.map((session) => {
                const isActive = pathname === `/chat/${session.id}`;
                const pinned = Boolean(session.is_pinned);
                return (
                  <SidebarMenuItem key={session.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={session.title}
                      className="h-9 font-normal text-[13px]"
                    >
                      <Link href={`/chat/${session.id}`}>
                        {pinned ? (
                          <Pin className="size-3 shrink-0 text-muted-foreground" />
                        ) : null}
                        <span className="truncate flex-1">{session.title}</span>
                        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground group-data-[collapsible=icon]:hidden">
                          {formatChatTime(session.created_at)}
                        </span>
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
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
