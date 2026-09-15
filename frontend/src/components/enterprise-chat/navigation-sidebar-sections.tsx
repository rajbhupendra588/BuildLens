"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Files, MessageSquare, Settings2 } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";

function isChatRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "/app" || pathname.startsWith("/chat/");
}

export function NavigationSidebarSections() {
  const pathname = usePathname();
  const { workspace } = useWorkspace();
  const projectName = workspace.project_name;

  return (
    <SidebarGroup className="py-1">
      <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden">
        Workspace
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip={`Project: ${projectName}`}
              className="text-[13px] font-medium h-auto py-2"
            >
              <Link href="/settings">
                <Settings2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-col items-start gap-0.5 group-data-[collapsible=icon]:hidden">
                  <span className="truncate w-full">{projectName}</span>
                  <span className="text-[10px] font-normal text-muted-foreground truncate w-full">
                    Project settings
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isChatRoute(pathname)}
              tooltip="Chat"
              className="text-[13px] font-normal"
            >
              <Link href="/app">
                <MessageSquare className="size-4" />
                <span>Chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === "/library"}
              tooltip="Document library"
              className="text-[13px] font-normal"
            >
              <Link href="/library">
                <Files className="size-4" />
                <span>Document library</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
