import { useChatStore } from "@/hooks/use-chat-store";
import { usePathname } from "next/navigation";

const CHAT_SESSION_PATH =
  /^\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function chatSessionIdFromPathname(pathname: string): string | null {
  const match = pathname.match(CHAT_SESSION_PATH);
  return match ? match[1] : null;
}

/** Session id for chat uploads and attachment UI (store, then URL). */
export function getActiveChatSessionId(pathname?: string | null): string | null {
  const fromStore = useChatStore.getState().currentSessionId;
  if (fromStore) return fromStore;
  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : null);
  if (!path) return null;
  return chatSessionIdFromPathname(path);
}

export function useActiveChatSessionId(): string | null {
  const pathname = usePathname();
  const storeId = useChatStore((s) => s.currentSessionId);
  if (storeId) return storeId;
  return chatSessionIdFromPathname(pathname);
}
