"use client";

import { Suspense, useLayoutEffect } from "react";
import { useParams } from "next/navigation";
import { SidebarInset } from "@/components/ui/sidebar";
import { ChatInterface } from "@/components/chat/chat-interface";
import { useChatStore } from "@/hooks/use-chat-store";

function ChatSessionContent() {
  const params = useParams<{ session_id: string }>();
  const { setCurrentSessionId } = useChatStore();

  useLayoutEffect(() => {
    if (params.session_id) {
      setCurrentSessionId(params.session_id);
    }
  }, [params.session_id, setCurrentSessionId]);

  return (
    <SidebarInset className="flex flex-col h-svh overflow-hidden bg-background">
      <ChatInterface />
    </SidebarInset>
  );
}

export default function ChatSessionPage() {
  return (
    <Suspense fallback={null}>
      <ChatSessionContent />
    </Suspense>
  );
}
