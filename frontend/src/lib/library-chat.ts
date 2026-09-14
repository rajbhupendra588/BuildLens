import { apiRequest } from "@/lib/api";
import { ChatSession } from "@/types/chat";
import { LibraryDocument } from "@/types/document";

export async function attachLibraryDocumentToSession(
  sessionId: string,
  documentId: string,
): Promise<void> {
  await apiRequest(`/chat/sessions/${sessionId}/attachments`, {
    method: "POST",
    body: JSON.stringify({ document_id: documentId }),
  });
  window.dispatchEvent(new CustomEvent("buildlens:session-attachments-changed"));
}

/** Create a new chat scoped to one library file, optionally with a first question. */
export async function startChatWithLibraryDocument(
  doc: LibraryDocument,
  question?: string,
): Promise<{
  session: ChatSession;
  initialQuestion: string | null;
}> {
  const session = await apiRequest<ChatSession>("/chat/sessions", {
    method: "POST",
  });
  await attachLibraryDocumentToSession(session.id, doc.document_id);
  const trimmed = question?.trim() ?? "";
  return {
    session,
    initialQuestion: trimmed.length > 0 ? trimmed : null,
  };
}
