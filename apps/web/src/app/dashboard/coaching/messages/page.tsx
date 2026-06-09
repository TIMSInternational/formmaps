"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Send, Search, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  listConversations,
  getConversationMessages,
  sendMessage,
  createConversation,
  searchContacts,
  ConversationSummary,
  MessageData,
} from "@/services/messageService";
import { useGlobalStore } from "@/store/useGlobalStore";
import { formatMessageTime as formatTime } from "@/lib/dateUtils";
import { getInitials } from "@/lib/stringUtils";
import ModerationMenu from "@/components/messages/ModerationMenu";

export default function CoachMessagesPage() {
  const userId = useGlobalStore((s) => s.user.id);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<{ id: string; name: string; email: string; roleName?: string }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;
  const filteredConversations = conversations.filter((c) =>
    !searchTerm || c.otherParticipant.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchConversations = useCallback(async () => {
    try { setConversations(await listConversations()); } catch {}
  }, []);

  const fetchMessages = useCallback(async (id: string, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const res = await getConversationMessages(id) as { data?: MessageData[]; messages?: MessageData[] };
      setMessages(res?.data ?? res?.messages ?? []);
    }
    catch { if (!silent) toast.error("Failed to load messages."); }
    finally { if (!silent) setLoadingMessages(false); }
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingConversations(true);
      try { setConversations(await listConversations()); }
      catch { toast.error("Failed to load conversations."); }
      finally { setLoadingConversations(false); }
    })();
  }, []);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      await fetchConversations();
      if (selectedId) await fetchMessages(selectedId, true);
    }, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedId, fetchConversations, fetchMessages]);

  useEffect(() => { if (selectedId) fetchMessages(selectedId); }, [selectedId, fetchMessages]);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Contact search for new message
  useEffect(() => {
    if (!showNewMessage) return;
    setContactsLoading(true);
    const t = setTimeout(async () => {
      try { setContacts(await searchContacts(contactSearch || undefined)); }
      catch { setContacts([]); }
      finally { setContactsLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearch, showNewMessage]);

  const handleNewConversation = async (recipientId: string) => {
    try {
      const conv = await createConversation(recipientId);
      setShowNewMessage(false);
      setContactSearch("");
      await fetchConversations();
      setSelectedId(conv.id);
      toast.success("Conversation started");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to start conversation");
    }
  };

  const handleSelect = (id: string) => { setSelectedId(id); setMessages([]); setInputValue(""); };

  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || !selectedId || sending) return;
    setSending(true);
    setInputValue("");
    const optimistic: MessageData = { id: `opt-${Date.now()}`, senderId: userId ?? "", content, messageType: "text", readAt: null, createdDate: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await sendMessage(selectedId, content);
      await fetchMessages(selectedId, true);
      await fetchConversations();
    } catch {
      toast.error("Failed to send message.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInputValue(content);
    } finally { setSending(false); inputRef.current?.focus(); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>
          Communication
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 4, letterSpacing: "-0.02em" }}>
          Messages
        </h1>
        <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginTop: 4, maxWidth: 480 }}>
          Communicate with your students and school staff.
        </p>
      </motion.div>

      {/* Split layout */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ display: "flex", height: "calc(100vh - 280px)", minHeight: 480, borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}
      >
        {/* Left — conversations */}
        <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--admin-border-default)" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--admin-border-light)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Conversations</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {totalUnread > 0 && (
                  <span style={{ minWidth: 20, height: 20, borderRadius: 10, padding: "0 6px", background: "#065292", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
                <button onClick={() => setShowNewMessage(!showNewMessage)} style={{
                  width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                  background: showNewMessage ? "#065292" : "var(--admin-bg-hover)",
                  color: showNewMessage ? "#fff" : "var(--admin-font-tertiary)",
                  border: "none", cursor: "pointer",
                }}>
                  {showNewMessage ? <X style={{ width: 14, height: 14 }} /> : <Plus style={{ width: 14, height: 14 }} />}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-light)" }}>
              <Search style={{ width: 14, height: 14, color: "var(--admin-font-light)", flexShrink: 0 }} />
              <input placeholder="Search conversations..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--admin-font-primary)", fontFamily: "inherit" }} />
            </div>
          </div>

          {/* New Message Contact Picker */}
          {showNewMessage && (
            <div style={{ borderBottom: "1px solid var(--admin-border-default)", padding: "8px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid #065292", marginBottom: 8 }}>
                <UserPlus style={{ width: 14, height: 14, color: "#065292", flexShrink: 0 }} />
                <input placeholder="Search by name or email..." value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} autoFocus
                  style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--admin-font-primary)", fontFamily: "inherit" }} />
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                {contactsLoading ? (
                  <div style={{ padding: 12, textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)" }}>Searching...</div>
                ) : contacts.length === 0 ? (
                  <div style={{ padding: 12, textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)" }}>No contacts found</div>
                ) : contacts.map((c) => (
                  <button key={c.id} onClick={() => handleNewConversation(c.id)} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    borderRadius: 6, border: "none", background: "transparent", cursor: "pointer",
                    fontFamily: "inherit", textAlign: "left", color: "var(--admin-font-primary)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #14b8a6, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                      {c.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{c.roleName?.replace("_", " ")} · {c.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
            {loadingConversations ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 6 }}>
                {[...Array(4)].map((_, i) => <div key={i} style={{ height: 60, borderRadius: 10, background: "var(--admin-bg-hover)" }} />)}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: 24 }}>
                <div style={{ width: 48, height: 48, borderRadius: 24, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MessageCircle style={{ width: 22, height: 22, color: "var(--admin-font-light)" }} />
                </div>
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", textAlign: "center" }}>
                  {searchTerm ? "No conversations match your search." : "No conversations yet."}
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <AnimatePresence initial={false}>
                  {filteredConversations.map((conv) => {
                    const active = conv.id === selectedId;
                    return (
                      <motion.button key={conv.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                        onClick={() => handleSelect(conv.id)}
                        style={{ width: "100%", textAlign: "left", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", background: active ? "var(--admin-bg-active)" : "transparent", color: "var(--admin-font-primary)" }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = active ? "var(--admin-bg-active)" : "transparent"; }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: active ? "#065292" : "var(--admin-bg-hover)", color: active ? "#fff" : "var(--admin-font-tertiary)" }}>
                          {getInitials(conv.otherParticipant.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.otherParticipant.name}</span>
                            <span style={{ fontSize: 10, color: "var(--admin-font-light)", flexShrink: 0 }}>{formatTime(conv.lastMessageAt)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginTop: 2 }}>
                            <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.lastMessagePreview ?? "No messages yet"}</p>
                            {conv.unreadCount > 0 && (
                              <span style={{ flexShrink: 0, minWidth: 18, height: 18, borderRadius: 9, padding: "0 5px", background: "#065292", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Right — thread */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {selectedConversation ? (
            <>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--admin-border-light)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: 17, background: "#065292", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                  {getInitials(selectedConversation.otherParticipant.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", lineHeight: 1.2 }}>{selectedConversation.otherParticipant.name}</p>
                  <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 1 }}>{selectedConversation.otherParticipant.email}</p>
                </div>
                <ModerationMenu
                  targetUserId={selectedConversation.otherParticipant.id}
                  targetName={selectedConversation.otherParticipant.name}
                />
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                {loadingMessages ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[...Array(5)].map((_, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: i % 2 === 0 ? "flex-start" : "flex-end" }}>
                        <div style={{ height: 36, borderRadius: 18, background: "var(--admin-bg-hover)", width: i % 2 === 0 ? 200 : 150 }} />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 8 }}>
                    <MessageCircle style={{ width: 32, height: 32, color: "var(--admin-font-light)", opacity: 0.4 }} />
                    <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>No messages yet. Send one to get started.</p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {messages.map((msg) => {
                      const isOwn = msg.senderId === userId;
                      return (
                        <motion.div key={msg.id} initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.15 }}
                          style={{ display: "flex", justifyContent: isOwn ? "flex-end" : "flex-start" }}>
                          <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", gap: 3, alignItems: isOwn ? "flex-end" : "flex-start" }}>
                            <div style={{ padding: "10px 14px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", borderRadius: isOwn ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: isOwn ? "#065292" : "var(--admin-bg-hover)", color: isOwn ? "#fff" : "var(--admin-font-primary)" }}>
                              {msg.content}
                            </div>
                            <span style={{ fontSize: 10, color: "var(--admin-font-light)", padding: "0 4px" }}>{formatTime(msg.createdDate)}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--admin-border-light)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", padding: "8px 12px" }}>
                  <textarea ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Type a message..." rows={1} disabled={sending}
                    style={{ flex: 1, resize: "none", border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--admin-font-primary)", fontFamily: "inherit", lineHeight: 1.5, maxHeight: 120, overflowY: "auto", padding: "2px 0", fieldSizing: "content" } as React.CSSProperties} />
                  <button onClick={handleSend} disabled={!inputValue.trim() || sending}
                    style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: inputValue.trim() ? "#065292" : "var(--admin-bg-card)", color: inputValue.trim() ? "#fff" : "var(--admin-font-light)", border: "none", cursor: inputValue.trim() ? "pointer" : "default", transition: "all 0.15s" }}>
                    <Send style={{ width: 14, height: 14 }} />
                  </button>
                </div>
                <p style={{ fontSize: 10, color: "var(--admin-font-light)", marginTop: 6, paddingLeft: 4 }}>
                  Press <span style={{ fontFamily: "monospace" }}>Enter</span> to send, <span style={{ fontFamily: "monospace" }}>Shift+Enter</span> for new line
                </p>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 16, padding: 32 }}>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
                style={{ width: 64, height: 64, borderRadius: 32, background: "var(--admin-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessageCircle style={{ width: 28, height: 28, color: "var(--admin-font-light)" }} />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} style={{ textAlign: "center" }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)" }}>Select a conversation</p>
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 4, maxWidth: 280 }}>Choose a conversation from the left to view and send messages.</p>
              </motion.div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
