"use client";

import type { CSSProperties } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { RequireAuth } from "@/components/auth/require-auth";
import { GlobalUploadIndicator } from "@/components/global-upload-indicator";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "16rem",
          } as CSSProperties
        }
      >
        <AppSidebar />
        {children}
      </SidebarProvider>
      <GlobalUploadIndicator />
    </RequireAuth>
  );
}
