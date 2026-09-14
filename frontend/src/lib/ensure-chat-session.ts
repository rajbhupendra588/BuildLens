import { apiRequest } from "@/lib/api";
import { ChatSession } from "@/types/chat";

export type EnsureSessionActions = {
  getCurrentSessionId: () => string | null;
  addSession: (session: ChatSession) => void;
  navigate: (path: string) => void;
};

/**
 * Returns an active chat session id, creating one when the user starts from `/`.
 */
export async function ensureChatSession(
  actions: EnsureSessionActions,
): Promise<string> {
  const existing = actions.getCurrentSessionId();
  if (existing) return existing;

  const newSession = await apiRequest<ChatSession>("/chat/sessions", {
    method: "POST",
  });
  actions.addSession(newSession);
  actions.navigate(`/chat/${newSession.id}`);
  return newSession.id;
}
