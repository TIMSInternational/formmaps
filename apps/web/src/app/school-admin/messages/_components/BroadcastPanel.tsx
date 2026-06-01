"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { apiRequest } from "@/lib/api/apiClient";
import { toast } from "sonner";
import {
  Megaphone, Send, Users, GraduationCap, UserCheck, Briefcase,
  AlertTriangle, CheckCircle2, Loader2,
} from "lucide-react";

const GROUPS = [
  { key: "students", label: "All Students", icon: GraduationCap, color: "#065292" },
  { key: "parents", label: "All Parents", icon: Users, color: "#14b8a6" },
  { key: "counselors", label: "All Counselors", icon: UserCheck, color: "#f59e0b" },
  { key: "staff", label: "All Staff", icon: Briefcase, color: "#ef4444" },
] as const;

type RecipientGroup = (typeof GROUPS)[number]["key"];

export default function BroadcastPanel() {
  const [selectedGroup, setSelectedGroup] = useState<RecipientGroup | null>(null);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastResult, setLastResult] = useState<{ count: number; group: string } | null>(null);

  const canSend = selectedGroup && content.trim().length > 0;

  const handleSend = async () => {
    if (!canSend || sending) return;
    setSending(true);
    setShowConfirm(false);
    try {
      const res = await apiRequest("/api/v1/messages/broadcast", {
        method: "POST",
        data: { recipientGroup: selectedGroup, content: content.trim() },
      });
      const count = res?.data?.recipientCount ?? res?.recipientCount ?? 0;
      const groupLabel = GROUPS.find((g) => g.key === selectedGroup)?.label ?? selectedGroup;
      setLastResult({ count, group: groupLabel });
      setContent("");
      setSelectedGroup(null);
      toast.success(`Broadcast sent to ${count} recipients`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to send broadcast");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>
          Communication
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 4, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
          <Megaphone style={{ width: 24, height: 24, color: "#065292" }} />
          Broadcast Message
        </h1>
        <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginTop: 4, maxWidth: 480 }}>
          Send a message to an entire group in your school. Each recipient receives an individual conversation.
        </p>
      </motion.div>

      {/* Success banner */}
      <AnimatePresence>
        {lastResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              padding: "14px 20px", borderRadius: 10,
              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
              display: "flex", alignItems: "center", gap: 10,
            }}
          >
            <CheckCircle2 style={{ width: 18, height: 18, color: "#22c55e", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--admin-font-primary)" }}>
              Broadcast sent to <strong>{lastResult.count}</strong> recipients ({lastResult.group}).
            </span>
            <button
              onClick={() => setLastResult(null)}
              style={{ marginLeft: "auto", fontSize: 12, color: "var(--admin-font-tertiary)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{
          borderRadius: 12,
          border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)",
          padding: "24px 28px",
          display: "flex", flexDirection: "column", gap: 24,
        }}
      >
        {/* Recipient group selector */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 10 }}>
            Recipients
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {GROUPS.map((group) => {
              const active = selectedGroup === group.key;
              return (
                <button
                  key={group.key}
                  onClick={() => setSelectedGroup(active ? null : group.key)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    padding: "16px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                    border: active ? `2px solid ${group.color}` : "1px solid var(--admin-border-default)",
                    background: active ? `${group.color}0D` : "var(--admin-bg-hover)",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = group.color; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = "var(--admin-border-default)"; }}
                >
                  <group.icon style={{ width: 20, height: 20, color: active ? group.color : "var(--admin-font-tertiary)" }} />
                  <span style={{ fontSize: 12, fontWeight: active ? 600 : 500, color: active ? group.color : "var(--admin-font-secondary)" }}>
                    {group.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message body */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
            Message
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your broadcast message..."
            rows={6}
            style={{
              width: "100%", resize: "vertical", borderRadius: 10,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-hover)",
              padding: "12px 14px", fontSize: 13, lineHeight: 1.6,
              color: "var(--admin-font-primary)", fontFamily: "inherit",
              outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--admin-accent-blue, #065292)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default)"; }}
          />
          <div style={{ fontSize: 11, color: "var(--admin-font-light)", marginTop: 4, textAlign: "right" }}>
            {content.length}/5000
          </div>
        </div>

        {/* Send / Confirm */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
          <AnimatePresence>
            {showConfirm && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 14px", borderRadius: 8,
                  background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
                  fontSize: 12, color: "var(--admin-font-secondary)",
                }}
              >
                <AlertTriangle style={{ width: 14, height: 14, color: "#f59e0b" }} />
                <span>This will message every user in the selected group.</span>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: "#065292", color: "#fff", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit",
                  }}
                >
                  {sending ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 12, height: 12 }} />}
                  Confirm
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  style={{ fontSize: 12, color: "var(--admin-font-tertiary)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {!showConfirm && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!canSend || sending}
              style={{
                height: 40, borderRadius: 10, padding: "0 24px", fontSize: 13, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 8,
                background: canSend ? "#065292" : "var(--admin-bg-hover)",
                color: canSend ? "#fff" : "var(--admin-font-light)",
                border: canSend ? "none" : "1px solid var(--admin-border-default)",
                cursor: canSend ? "pointer" : "not-allowed",
                transition: "all 0.15s",
                fontFamily: "inherit",
              }}
            >
              <Send style={{ width: 14, height: 14 }} />
              Send Broadcast
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
