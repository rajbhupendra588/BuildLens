"use client";

import { Message } from "@/types/chat";
import { useState } from "react";
import { useChatStore } from "./use-chat-store";
import { apiStream } from "@/lib/api";

export function useChatStream() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const { currentSessionId, selectedProvider, selectedModel } = useChatStore();

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
    }
  };

  return { messages, setMessages, sendMessage, isTyping };
}
