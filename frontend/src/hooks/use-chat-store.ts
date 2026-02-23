import { create } from "zustand";

interface ChatState {
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  currentSessionId: null,
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
}));
