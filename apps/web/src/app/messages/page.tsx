"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Send, User } from "lucide-react";
import { toast } from "sonner";
import {
  listConversations,
  getConversationMessages,
  sendMessage,
  ConversationSummary,
  MessageData,
} from "@/services/messageService";
import { useGlobalStore } from "@/store/useGlobalStore";

function formatTime(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function MessagesPage() {
  const userId = useGlobalStore((s) => s.user.id);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load conversations
  const fetchConversations = useCallback(async () => {
    try {
      const data = await listConversations();
      setConversations(data);
    } catch {
      // Silent poll failures — only show error on mount
    }
  }, []);

  // Load messages for a conversation
  const fetchMessages = useCallback(
    async (conversationId: string, silent = false) => {
      if (!silent) setLoadingMessages(true);
      try {
        const result = await getConversationMessages(conversationId);
        const msgs: MessageData[] = result?.messages ?? [];
        setMessages(msgs);
      } catch {
        if (!silent) toast.error("Failed to load messages.");
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    []
  );

  // Mount: load conversations once
  useEffect(() => {
    (async () => {
      setLoadingConversations(true);
      try {
        const data = await listConversations();
        setConversations(data);
      } catch {
        toast.error("Failed to load conversations.");
      } finally {
        setLoadingConversations(false);
      }
    })();
  }, []);

  // Poll for new messages every 15s
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      await fetchConversations();
      if (selectedId) {
        await fetchMessages(selectedId, true);
      }
    }, 15_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId, fetchConversations, fetchMessages]);

  // When conversation selected, load messages
  useEffect(() => {
    if (!selectedId) return;
    fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSelectConversation = (id: string) => {
    setSelectedId(id);
    setMessages([]);
    setInputValue("");
  };

  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || !selectedId || sending) return;

    setSending(true);
    setInputValue("");

    // Optimistic update
    const optimistic: MessageData = {
      id: `optimistic-${Date.now()}`,
      senderId: userId ?? "",
      content,
      messageType: "text",
      readAt: null,
      createdDate: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await sendMessage(selectedId, content);
      // Refresh to get the real message
      await fetchMessages(selectedId, true);
      await fetchConversations();
    } catch {
      toast.error("Failed to send message.");
      // Rollback optimistic
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInputValue(content);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
          Messaging
        </span>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
          Messages
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Communicate with your counselors, coaches, and school staff.
        </p>
      </motion.div>

      {/* Split layout */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex h-[calc(100vh-260px)] min-h-[480px] rounded-xl border border-border bg-card overflow-hidden shadow-sm"
      >
        {/* Left panel — conversation list */}
        <div className="w-[300px] shrink-0 flex flex-col border-r border-border">
          {/* Panel header */}
          <div className="px-4 py-3.5 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Conversations</span>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? (
              <div className="flex flex-col gap-2 p-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 rounded-lg bg-muted/50 animate-pulse"
                  />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
              </div>
            ) : (
              <ul className="p-2 flex flex-col gap-0.5">
                <AnimatePresence initial={false}>
                  {conversations.map((conv) => {
                    const isActive = conv.id === selectedId;
                    return (
                      <motion.li
                        key={conv.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.15 }}
                      >
                        <button
                          onClick={() => handleSelectConversation(conv.id)}
                          className={`w-full text-left rounded-lg px-3 py-2.5 flex items-start gap-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isActive
                              ? "bg-primary/10 text-foreground"
                              : "hover:bg-muted/60 text-foreground"
                          }`}
                        >
                          {/* Avatar */}
                          <div
                            className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {getInitials(conv.otherParticipant.name)}
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-medium truncate">
                                {conv.otherParticipant.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {formatTime(conv.lastMessageAt)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-1 mt-0.5">
                              <p className="text-xs text-muted-foreground truncate leading-relaxed">
                                {conv.lastMessagePreview ?? "No messages yet"}
                              </p>
                              {conv.unreadCount > 0 && (
                                <span className="shrink-0 ml-1 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                                  {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>

        {/* Right panel — message thread */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedConversation ? (
            <>
              {/* Thread header */}
              <div className="px-5 py-3.5 border-b border-border flex items-center gap-3 shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {getInitials(selectedConversation.otherParticipant.name)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {selectedConversation.otherParticipant.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedConversation.otherParticipant.email}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
                {loadingMessages ? (
                  <div className="flex flex-col gap-3">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`h-9 rounded-2xl bg-muted/50 animate-pulse ${
                            i % 2 === 0 ? "w-48" : "w-36"
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
                    <MessageCircle className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      No messages yet. Send one to get started.
                    </p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {messages.map((msg) => {
                      const isOwn = msg.senderId === userId;
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[70%] flex flex-col gap-1 ${
                              isOwn ? "items-end" : "items-start"
                            }`}
                          >
                            <div
                              className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                isOwn
                                  ? "bg-primary text-primary-foreground rounded-br-sm"
                                  : "bg-muted text-foreground rounded-bl-sm"
                              }`}
                            >
                              {msg.content}
                            </div>
                            <span className="text-[10px] text-muted-foreground px-1">
                              {formatTime(msg.createdDate)}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="px-4 py-3 border-t border-border shrink-0">
                <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring transition-shadow">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message… (Enter to send)"
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed max-h-32 overflow-y-auto py-0.5"
                    style={{ fieldSizing: "content" } as React.CSSProperties}
                    disabled={sending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || sending}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-primary text-primary-foreground transition-opacity disabled:opacity-40 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Send message"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
                  Press <kbd className="font-mono">Enter</kbd> to send,{" "}
                  <kbd className="font-mono">Shift+Enter</kbd> for a new line.
                </p>
              </div>
            </>
          ) : (
            /* Empty state — no conversation selected */
            <div className="flex flex-col items-center justify-center flex-1 gap-4 px-8 text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="w-16 h-16 rounded-full bg-muted flex items-center justify-center"
              >
                <User className="w-7 h-7 text-muted-foreground" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="flex flex-col gap-1"
              >
                <p className="text-base font-semibold text-foreground">
                  Select a conversation
                </p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Choose a conversation from the left panel to view and send messages.
                </p>
              </motion.div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
