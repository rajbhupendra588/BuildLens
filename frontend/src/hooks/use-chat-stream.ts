"use client";

import { Message, ChatSession, MediaAttachment, SourceItem } from "@/types/chat";
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

  const sendMessage = async (question: string) => {
    if (!question.trim() || !currentSessionId) return;

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
    let accumulatedContent = "";
    let sources: SourceItem[] = [];
    let media: MediaAttachment[] = [];
    let detectedMode: string | undefined;
    let modeLabel: string | undefined;
    let modeIcon: string | undefined;

    const upsertAssistant = (content: string) => {
      setMessages((prev) => {
        const others = prev.filter((m) => m.id !== aiMsgId);
        return [
          ...others,
          {
            id: aiMsgId,
            role: "assistant" as const,
            content,
            sources,
            media,
            detectedMode,
            modeLabel,
            modeIcon,
            created_at: new Date().toISOString(),
          },
        ];
      });
    };

    const patchAssistant = (content: string) => {
      setMessages((prev) => {
        const others = prev.filter((m) => m.id !== aiMsgId);
        return [
          ...others,
          {
            id: aiMsgId,
            role: "assistant" as const,
            content,
            sources,
            media,
            detectedMode,
            modeLabel,
            modeIcon,
            created_at: new Date().toISOString(),
          },
        ];
      });
    };

    try {
      const params = new URLSearchParams({
        question,
        session_id: currentSessionId,
        provider: selectedProvider,
        model: selectedModel,
      });

      const reader = await apiStream(`/chat/ask-stream?${params.toString()}`, {
        signal: controller.signal,
      });
      const decoder = new TextDecoder();

      outer: while (true) {
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

            if (data.type === "done") break outer;

            if (data.type === "error") {
              console.error("LLM Error:", data.content);
              upsertAssistant(
                typeof data.content === "string"
                  ? data.content
                  : "Something went wrong while generating a reply.",
              );
              break outer;
            }

            if (data.type === "status" && typeof data.text === "string") {
              setStreamStatus(data.text);
            }

            if (data.type === "sources") {
              sources = data.sources ?? [];
              patchAssistant("");
            }

            if (data.type === "media") {
              media = data.media ?? [];
              patchAssistant(accumulatedContent);
            }

            if (data.type === "intent") {
              detectedMode = data.mode;
              modeLabel = data.label;
              modeIcon = data.icon;
              patchAssistant(accumulatedContent);
            }

            if (data.type === "content") {
              accumulatedContent += data.text;
              patchAssistant(accumulatedContent);
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
          setMessages((prev) => {
            const others = prev.filter((m) => m.id !== aiMsgId);
            return [
              ...others,
              {
                id: aiMsgId,
                role: "assistant" as const,
                content: accumulatedContent,
                sources,
                media,
                detectedMode,
                modeLabel,
                modeIcon,
                created_at: new Date().toISOString(),
              },
            ];
          });
        }
      } else {
        console.error("Stream error:", error);
      }
    } finally {
      abortControllerRef.current = null;
      setIsTyping(false);
      setStreamStatus(null);

      // Refresh session title after first exchange
      if (currentSessionId) {
        const sessionId = currentSessionId;
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
    isTyping,
    streamStatus,
    stopGeneration,
  };
}
