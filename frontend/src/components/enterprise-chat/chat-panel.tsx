"use client";

import type { ReactNode } from "react";
import {
  chatPanelContentClassName,
  chatPanelOuterClassName,
} from "@/lib/chat-panel-layout";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  children: ReactNode;
  className?: string;
}

export function ChatPanel({ children, className }: ChatPanelProps) {
  return (
    <div className={chatPanelOuterClassName()}>
      <div className={cn(chatPanelContentClassName(), className)}>{children}</div>
    </div>
  );
}
