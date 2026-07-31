"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useChatThreads, type ChatThread, type ChatMessage } from "./useChatThreads";

interface ChatContextValue {
  threads: ChatThread[];
  currentThread: ChatThread | null;
  currentThreadId: string | null;
  createThread: () => ChatThread;
  selectThread: (id: string) => void;
  addMessage: (threadId: string, message: ChatMessage) => void;
  deleteThread: (id: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useGlobalStore();
  // Pass userId so each user's chats are isolated in localStorage
  const value = useChatThreads(user.id);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
