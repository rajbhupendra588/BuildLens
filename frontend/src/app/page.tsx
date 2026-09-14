import { ChatInterface } from "@/components/chat/chat-interface";
import { SidebarInset } from "@/components/ui/sidebar";

export default function Home() {
  return (
    <SidebarInset className="flex flex-col h-svh overflow-hidden bg-background">
      <ChatInterface />
    </SidebarInset>
  );
}
