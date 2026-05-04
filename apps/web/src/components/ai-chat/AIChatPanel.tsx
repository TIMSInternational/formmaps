"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, User, Lightbulb } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useGlobalStore } from "@/store/useGlobalStore";
import { usePermission } from "@/hooks/usePermission";
import { useChat } from "./ChatContext";
import { getChatSuggestions } from "./aiPrompts";
import type { ChatMessage } from "./useChatThreads";
import { AnimatedAIInput } from "@/components/ui/animated-ai-input";
import { ShiningText } from "@/components/ui/shining-text";

const AI_SERVICE_URL =
  process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:8000";

/** Side-panel chat UI — works with ChatContext threads */
export function AIChatSidePanel() {
  const { currentThread, currentThreadId, addMessage, createThread } = useChat();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useGlobalStore();
  const { role } = usePermission();
  const suggestions = getChatSuggestions(role);

  const messages = currentThread?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

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
        const token = localStorage.getItem("token") || "";

        // Build history from current thread (last 10 messages)
        const history = messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await fetch(`${AI_SERVICE_URL}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user?.id || "",
            token,
            message: text.trim(),
            role: role || "STUDENT",
            conversation_id: threadId,
            history,
          }),
        });

        if (!response.ok) {
          throw new Error(`AI service error: ${response.status}`);
        }

        // Parse SSE stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data:")) {
              const jsonStr = line.slice(5).trim();
              if (!jsonStr) continue;
              try {
                const event = JSON.parse(jsonStr);
                if (event.text) {
                  fullText += event.text;
                } else if (event.name && event.status) {
                  // Tool call event
                  const label = event.name.replace(/_/g, " ").replace("get ", "");
                  setToolStatus(
                    event.status === "running"
                      ? `Looking up ${label}...`
                      : null,
                  );
                } else if (event.message) {
                  // Error event
                  fullText = event.message;
                }
              } catch {
                // Skip malformed events
              }
            }
          }
        }

        addMessage(threadId, {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: fullText || "I couldn't generate a response. Please try again.",
          timestamp: Date.now(),
        });
      } catch {
        addMessage(threadId, {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I couldn't connect to the AI service right now. Please try again in a moment.",
          timestamp: Date.now(),
        });
      } finally {
        setLoading(false);
        setToolStatus(null);
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
                <ShiningText text={toolStatus || "NEXA AI is thinking..."} />
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
