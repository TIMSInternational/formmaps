"use client";

import { useState, useCallback, useEffect } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// Storage keys are per-user to isolate chats between accounts
function storageKey(userId: string) {
  return `nexa_chat_threads_${userId}`;
}
function currentThreadKey(userId: string) {
  return `nexa_current_thread_${userId}`;
}

function loadThreads(userId: string): ChatThread[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveThreads(userId: string, threads: ChatThread[]) {
  if (!userId) return;
  localStorage.setItem(storageKey(userId), JSON.stringify(threads));
}

export function useChatThreads(userId: string | null) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  // Load threads when userId changes (login/logout)
  useEffect(() => {
    if (!userId) {
      setThreads([]);
      setCurrentThreadId(null);
      return;
    }
    setThreads(loadThreads(userId));
    const saved = localStorage.getItem(currentThreadKey(userId));
    if (saved) setCurrentThreadId(saved);
  }, [userId]);

  const currentThread = threads.find((t) => t.id === currentThreadId) ?? null;

  const createThread = useCallback((): ChatThread => {
    const thread: ChatThread = {
      id: `thread-${Date.now()}`,
      title: "New chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setThreads((prev) => {
      const next = [thread, ...prev];
      if (userId) saveThreads(userId, next);
      return next;
    });
    setCurrentThreadId(thread.id);
    if (userId) localStorage.setItem(currentThreadKey(userId), thread.id);
    return thread;
  }, [userId]);

  const selectThread = useCallback((id: string) => {
    setCurrentThreadId(id);
    if (userId) localStorage.setItem(currentThreadKey(userId), id);
  }, [userId]);

  const addMessage = useCallback((threadId: string, message: ChatMessage) => {
    setThreads((prev) => {
      const next = prev.map((t) => {
        if (t.id !== threadId) return t;
        const messages = [...t.messages, message];
        const title =
          t.title === "New chat" && message.role === "user"
            ? message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "")
            : t.title;
        return { ...t, messages, title, updatedAt: Date.now() };
      });
      if (userId) saveThreads(userId, next);
      return next;
    });
  }, [userId]);

  const deleteThread = useCallback((id: string) => {
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (userId) saveThreads(userId, next);
      return next;
    });
    if (currentThreadId === id) {
      setCurrentThreadId(null);
      if (userId) localStorage.removeItem(currentThreadKey(userId));
    }
  }, [currentThreadId, userId]);

  return {
    threads,
    currentThread,
    currentThreadId,
    createThread,
    selectThread,
    addMessage,
    deleteThread,
  };
}

// Group threads by date
export function groupThreadsByDate(threads: ChatThread[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const yesterdayMs = todayMs - 86400000;
  const weekMs = todayMs - 7 * 86400000;

  const groups: { label: string; threads: ChatThread[] }[] = [];
  const todayThreads: ChatThread[] = [];
  const yesterdayThreads: ChatThread[] = [];
  const weekThreads: ChatThread[] = [];
  const olderThreads: ChatThread[] = [];

  for (const t of threads) {
    if (t.updatedAt >= todayMs) todayThreads.push(t);
    else if (t.updatedAt >= yesterdayMs) yesterdayThreads.push(t);
    else if (t.updatedAt >= weekMs) weekThreads.push(t);
    else olderThreads.push(t);
  }

  if (todayThreads.length) groups.push({ label: "Today", threads: todayThreads });
  if (yesterdayThreads.length) groups.push({ label: "Yesterday", threads: yesterdayThreads });
  if (weekThreads.length) groups.push({ label: "Last 7 days", threads: weekThreads });
  if (olderThreads.length) groups.push({ label: "Older", threads: olderThreads });

  return groups;
}

export function formatThreadTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
