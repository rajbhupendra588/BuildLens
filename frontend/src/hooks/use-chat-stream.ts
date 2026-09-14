"use client";

import {
  Message,
  ChatSession,
  MediaAttachment,
  SourceItem,
  HistoryMessage,
  hydrateChatMessage,
} from "@/types/chat";
import { useRef, useState } from "react";
import { useChatStore } from "./use-chat-store";
import { apiStream, apiRequest } from "@/lib/api";

export function useChatStream() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    currentSessionId,
    selectedProvider,
    selectedModel,
    updateSessionTitle,
  } = useChatStore();

  const stopGeneration = () => {
    abortControllerRef.current?.abort();
  };

  const refreshHistory = async (sessionId: string) => {
    const rawHistory = await apiRequest<HistoryMessage[]>(
      `/chat/history/${sessionId}`,
    );
    setMessages(rawHistory.map(hydrateChatMessage));
  };

  const rollbackFrom = async (messageId: string, sessionId?: string | null) => {
    const sid = sessionId ?? currentSessionId;
    if (!sid) return;
    await apiRequest(`/chat/sessions/${sid}/messages/${messageId}/rollback`, {
      method: "POST",
    });
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === messageId);
      if (index === -1) return prev;
      return prev.slice(0, index);
    });
  };

  const sendMessage = async (
    question: string,
    sessionIdOverride?: string | null,
  ) => {
    const sessionId = sessionIdOverride ?? currentSessionId;
    if (!question.trim() || !sessionId) return;

    setIsTyping(true);
    setStreamStatus(null);

    // Create a fresh AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const aiMsgId = crypto.randomUUID();
    const aiCreatedAt = new Date().toISOString();
    let accumulatedContent = "";
    let sources: SourceItem[] = [];
    let media: MediaAttachment[] = [];
    let detectedMode: string | undefined;
    let modeLabel: string | undefined;
    let modeIcon: string | undefined;
    let resolvedAiId = aiMsgId;

    const upsertAssistant = (content: string) => {
      setMessages((prev) => {
        const others = prev.filter((m) => m.id !== resolvedAiId && m.id !== aiMsgId);
        return [
          ...others,
          {
            id: resolvedAiId,
            role: "assistant" as const,
            content,
            sources,
            media,
            detectedMode,
            modeLabel,
            modeIcon,
            created_at: aiCreatedAt,
          },
        ];
      });
    };

    try {
      const params = new URLSearchParams({
        question,
        session_id: sessionId,
        provider: selectedProvider,
        model: selectedModel,
      });

      const reader = await apiStream(`/chat/ask-stream?${params.toString()}`, {
        signal: controller.signal,
      });
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const dataStr = line.slice("data: ".length).trim();
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (data.type === "done") continue;

            if (data.type === "user_message" && typeof data.id === "string") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === userMsg.id
                    ? {
                        ...m,
                        id: data.id,
                        created_at: data.created_at ?? m.created_at,
                      }
                    : m,
                ),
              );
              userMsg.id = data.id;
              continue;
            }

            if (data.type === "assistant_saved" && typeof data.id === "string") {
              const previousId = resolvedAiId;
              resolvedAiId = data.id;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === previousId || m.id === aiMsgId
                    ? {
                        ...m,
                        id: data.id,
                        created_at: data.created_at ?? m.created_at,
                      }
                    : m,
                ),
              );
              continue;
            }

            if (data.type === "error") {
              console.error("LLM Error:", data.content);
              upsertAssistant(
                typeof data.content === "string"
                  ? data.content
                  : "Something went wrong while generating a reply.",
              );
              continue;
            }

            if (data.type === "status" && typeof data.text === "string") {
              setStreamStatus(data.text);
            }

            if (data.type === "sources") {
              sources = data.sources ?? [];
              upsertAssistant(accumulatedContent);
            }

            if (data.type === "media") {
              media = data.media ?? [];
              upsertAssistant(accumulatedContent);
            }

            if (data.type === "intent") {
              detectedMode = data.mode;
              modeLabel = data.label;
              modeIcon = data.icon;
              upsertAssistant(accumulatedContent);
            }

            if (data.type === "content") {
              accumulatedContent += data.text;
              upsertAssistant(accumulatedContent);
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (error: unknown) {
      // AbortError is expected when stopGeneration() is called — not an error
      if (error instanceof Error && error.name === "AbortError") {
        // Mark the partial response as complete
        if (accumulatedContent) {
          upsertAssistant(accumulatedContent);
        }
      } else {
        console.error("Stream error:", error);
      }
    } finally {
      abortControllerRef.current = null;
      setIsTyping(false);
      setStreamStatus(null);

      if (sessionId) {
        setTimeout(async () => {
          try {
            const sessions = await apiRequest<ChatSession[]>("/chat/sessions");
            const updated = sessions.find((s) => s.id === sessionId);
            if (updated) updateSessionTitle(sessionId, updated.title);
          } catch {
            // non-critical
          }
        }, 800);
      }
    }
  };

  return {
    messages,
    setMessages,
    sendMessage,
    rollbackFrom,
    refreshHistory,
    isTyping,
    streamStatus,
    stopGeneration,
  };
}
