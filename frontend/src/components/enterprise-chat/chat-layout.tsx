"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChatLayoutProps {
  header: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChatLayout({ header, children, className }: ChatLayoutProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col min-h-0 overflow-hidden bg-[var(--enterprise-bg)]",
        className,
      )}
    >
      {header}
      <main className="flex min-w-0 flex-1 flex-col min-h-0">{children}</main>
    </div>
  );
}
