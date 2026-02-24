"use client";

import { Message, ChatSession } from "@/types/chat";
import { useState } from "react";
import { useChatStore } from "./use-chat-store";
import { apiStream, apiRequest } from "@/lib/api";

export function useChatStream() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const { currentSessionId, selectedProvider, selectedModel, ragTopK, ragThreshold, updateSessionTitle } = useChatStore();

  const sendMessage = async (question: string) => {
    if (!question.trim() || !currentSessionId) return;

    setIsTyping(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const params = new URLSearchParams({
        question,
        session_id: currentSessionId,
        provider: selectedProvider,
        model: selectedModel,
        top_k: String(ragTopK),
        score_threshold: String(ragThreshold),
      });

      const reader = await apiStream(`/chat/ask-stream?${params.toString()}`);
      const decoder = new TextDecoder();

      const aiMsgId = crypto.randomUUID();
      let accumulatedContent = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const dataStr = line.replace("data: ", "").trim();
          try {
            const data = JSON.parse(dataStr);
            if (data.type === "done") break;

            if (data.type === "error") {
              console.error("LLM Error:", data.content);
              break;
            }

            if (data.type === "content") {
              accumulatedContent += data.text;

              setMessages((prev) => {
                const otherMessages = prev.filter((m) => m.id !== aiMsgId);
                return [
                  ...otherMessages,
                  {
                    id: aiMsgId,
                    role: "assistant" as const,
                    content: accumulatedContent,
                    created_at: new Date().toISOString(),
                  },
                ];
              });
            }
          } catch (e) {
            console.error("Parse Error", e);
          }
        }
      }
    } catch (error) {
      console.error("Stream Error", error);
    } finally {
      setIsTyping(false);
      // Refresh session title — the backend generates it as a background task
      // so we poll briefly after the stream to pick up the new title.
      if (currentSessionId) {
        const sessionId = currentSessionId;
        setTimeout(async () => {
          try {
            const sessions = await apiRequest<ChatSession[]>("/chat/sessions");
            const updated = sessions.find((s) => s.id === sessionId);
            if (updated) updateSessionTitle(sessionId, updated.title);
          } catch {
            // Non-critical; ignore
          }
        }, 800);
      }
    }
  };

  return { messages, setMessages, sendMessage, isTyping };
}
