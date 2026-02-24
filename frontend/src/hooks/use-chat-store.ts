import { ChatSession } from "@/types/chat";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChatState {
  // Session management
  currentSessionId: string | null;
  sessions: ChatSession[];
  setCurrentSessionId: (id: string | null) => void;
  setSessions: (sessions: ChatSession[]) => void;
  addSession: (session: ChatSession) => void;
  removeSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;

  // LLM model selection (persisted to localStorage)
  selectedProvider: string;
  selectedModel: string;
  setSelectedProvider: (provider: string) => void;
  setSelectedModel: (model: string) => void;

  // RAG retrieval params (persisted to localStorage)
  ragTopK: number;
  ragThreshold: number;
  setRagTopK: (v: number) => void;
  setRagThreshold: (v: number) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      // Session management
      currentSessionId: null,
      sessions: [],
      setCurrentSessionId: (id) => set({ currentSessionId: id }),
      setSessions: (sessions) => set({ sessions }),
      addSession: (session) =>
        set((state) => ({
          sessions: [session, ...state.sessions],
          currentSessionId: session.id,
        })),
      removeSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          currentSessionId:
            state.currentSessionId === id ? null : state.currentSessionId,
        })),
      updateSessionTitle: (id, title) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title } : s,
          ),
        })),

      // LLM model selection
      selectedProvider: "ollama",
      selectedModel: "",
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),
      setSelectedModel: (model) => set({ selectedModel: model }),

      // RAG retrieval params
      ragTopK: 5,
      ragThreshold: 0.3,
      setRagTopK: (v) => set({ ragTopK: v }),
      setRagThreshold: (v) => set({ ragThreshold: v }),
    }),
    {
      name: "docrag-settings", // localStorage key
      partialize: (state) => ({
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
        ragTopK: state.ragTopK,
        ragThreshold: state.ragThreshold,
      }),
    },
  ),
);
