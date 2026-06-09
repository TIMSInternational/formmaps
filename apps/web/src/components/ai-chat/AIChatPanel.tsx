"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, User, Lightbulb } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useGlobalStore } from "@/store/useGlobalStore";
import { usePermission } from "@/hooks/usePermission";
import { useChat } from "./ChatContext";
import { getChatSuggestions } from "./aiPrompts";
import { askAi } from "@/services/aiChatService";
import type { ChatMessage } from "./useChatThreads";
import { AnimatedAIInput } from "@/components/ui/animated-ai-input";
import { ShiningText } from "@/components/ui/shining-text";

const REQUEST_TIMEOUT_MS = 45_000;

/** Side-panel chat UI — works with ChatContext threads */
export function AIChatSidePanel() {
  const { currentThread, currentThreadId, addMessage, createThread } = useChat();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { user } = useGlobalStore();
  const { role } = usePermission();
  const suggestions = getChatSuggestions(role);

  const messages = currentThread?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Timeout
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let threadId = currentThreadId;
      if (!threadId) {
        const t = createThread();
        threadId = t.id;
      }

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };
      addMessage(threadId, userMsg);
      setInput("");
      setLoading(true);
      setToolStatus(null);

      try {
        const history = messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const fullText = await askAi(text.trim(), history, controller.signal);

        addMessage(threadId, {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: fullText || "I couldn't generate a response. Please try again.",
          timestamp: Date.now(),
        });
      } catch (err) {
        const status = (err as { status?: number })?.status;
        const aborted =
          (err as { code?: string })?.code === "ERR_CANCELED" ||
          (err instanceof DOMException && err.name === "AbortError");
        let content = "Sorry, I couldn't connect to the AI service right now. Please try again in a moment.";
        if (aborted) {
          content = "The request timed out. Please try a simpler question.";
        } else if (status === 401) {
          content = "Your session has expired. Please log in again.";
        } else if (status === 403) {
          content = "FormMaps AI requires an active subscription. Visit the Subscriptions page to upgrade your plan.";
        }
        addMessage(threadId, {
          id: `e-${Date.now()}`,
          role: "assistant",
          content,
          timestamp: Date.now(),
        });
      } finally {
        clearTimeout(timeout);
        setLoading(false);
        setToolStatus(null);
        abortRef.current = null;
      }
    },
    [loading, user?.id, role, currentThreadId, addMessage, createThread, messages],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", margin: "-16px", overflow: "hidden" }}>
      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {messages.length === 0 && (
          <div style={{ maxWidth: 360, margin: "32px auto 0", textAlign: "center" }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", margin: "0 auto 8px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--admin-accent-bg-blue)", border: "1px solid var(--admin-accent-border-blue)",
            }}>
              <Sparkles style={{ width: 18, height: 18, color: "var(--admin-accent-blue)" }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
              Hi {user?.name?.split(" ")[0] || "there"}!
            </div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
              How can I help you today?
            </div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <Lightbulb style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--admin-font-tertiary)" }}>
                  Try asking
                </span>
              </div>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  style={{
                    width: "100%", textAlign: "left", padding: "8px 12px",
                    borderRadius: 8, fontSize: 12,
                    background: "var(--admin-bg-card)", color: "var(--admin-font-secondary)",
                    border: "1px solid var(--admin-border-default)", cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex", gap: 8, maxWidth: "100%",
                flexDirection: msg.role === "user" ? "row-reverse" : "row",
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: msg.role === "assistant" ? "var(--admin-accent-bg-blue)" : "var(--admin-bg-hover)",
                border: `1px solid ${msg.role === "assistant" ? "var(--admin-accent-border-blue)" : "var(--admin-border-default)"}`,
              }}>
                {msg.role === "assistant"
                  ? <Sparkles style={{ width: 12, height: 12, color: "var(--admin-accent-blue)" }} />
                  : <User style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />}
              </div>
              <div style={{
                maxWidth: "85%", padding: "8px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                background: msg.role === "user" ? "var(--admin-accent-blue)" : "var(--admin-bg-card)",
                color: msg.role === "user" ? "#fff" : "var(--admin-font-secondary)",
                border: msg.role === "assistant" ? "1px solid var(--admin-border-default)" : "none",
              }}>
                {msg.role === "assistant" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p style={{ marginBottom: 6 }}>{children}</p>,
                      ul: ({ children }) => <ul style={{ paddingLeft: 16, marginBottom: 6 }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ paddingLeft: 16, marginBottom: 6 }}>{children}</ol>,
                      strong: ({ children }) => <strong style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{children}</strong>,
                      code: ({ children }) => (
                        <code style={{ padding: "1px 4px", borderRadius: 3, fontSize: 11, background: "var(--admin-bg-hover)", color: "var(--admin-accent-blue)" }}>
                          {children}
                        </code>
                      ),
                      table: ({ children }) => (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 8 }}>{children}</table>
                      ),
                      thead: ({ children }) => (
                        <thead style={{ borderBottom: "2px solid var(--admin-border-default)" }}>{children}</thead>
                      ),
                      th: ({ children }) => (
                        <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, color: "var(--admin-font-primary)", fontSize: 11 }}>{children}</th>
                      ),
                      td: ({ children }) => (
                        <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--admin-border-light)" }}>{children}</td>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--admin-accent-bg-blue)", border: "1px solid var(--admin-accent-border-blue)",
              }}>
                <Sparkles style={{ width: 12, height: 12, color: "var(--admin-accent-blue)" }} />
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10,
                background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
              }}>
                <ShiningText text={toolStatus || "FORMMAPS AI is thinking..."} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px 16px", flexShrink: 0 }}>
        <AnimatedAIInput
          value={input}
          onChange={setInput}
          onSend={sendMessage}
          disabled={loading}
        />
      </div>
    </div>
  );
}

/** Legacy full-page wrapper (kept for /dashboard/ai-coach route) */
export function AIChatPage() {
  return <AIChatSidePanel />;
}
