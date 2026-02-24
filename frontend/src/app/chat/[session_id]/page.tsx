"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { SidebarInset } from "@/components/ui/sidebar";
import { ChatInterface } from "@/components/chat/chat-interface";
import { useChatStore } from "@/hooks/use-chat-store";

export default function ChatSessionPage() {
  const params = useParams<{ session_id: string }>();
  const { setCurrentSessionId } = useChatStore();

  useEffect(() => {
    if (params.session_id) {
      setCurrentSessionId(params.session_id);
    }
  }, [params.session_id, setCurrentSessionId]);

  return (
    <SidebarInset className="flex flex-col h-screen">
      <ChatInterface />
    </SidebarInset>
  );
}
