import { ChatSession } from "@/types/chat";
import { DEFAULT_CHAT_MODEL, DEFAULT_CHAT_PROVIDER } from "@/lib/chat-models";
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
      selectedProvider: DEFAULT_CHAT_PROVIDER,
      selectedModel: DEFAULT_CHAT_MODEL,
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),
      setSelectedModel: (model) => set({ selectedModel: model }),

    }),
    {
      name: "buildlens-settings", // localStorage key
      partialize: (state) => ({
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
      }),
    },
  ),
);
