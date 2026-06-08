"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MoreVertical, Flag, Ban, X } from "lucide-react";
import { toast } from "sonner";
import { reportTarget, blockUser, unblockUser } from "@/services/moderationService";

interface ModerationMenuProps {
  targetUserId: string;
  targetName: string;
}

/**
 * Report / block controls for a message thread. Lets any user flag the other
 * participant for review or block them so neither side can message again.
 */
export default function ModerationMenu({ targetUserId, targetName }: ModerationMenuProps) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const close = () => { setOpen(false); setReporting(false); setReason(""); };

  const handleReport = async () => {
    const trimmed = reason.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await reportTarget("user", targetUserId, trimmed.slice(0, 1000));
      toast.success("Report submitted. Our team will review it.");
      close();
    } catch {
      toast.error("Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlockToggle = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (blocked) {
        await unblockUser(targetUserId);
        setBlocked(false);
        toast.success(`Unblocked ${targetName}.`);
      } else {
        await blockUser(targetUserId);
        setBlocked(true);
        toast.success(`Blocked ${targetName}. They can no longer message you.`);
      }
      close();
    } catch {
      toast.error("Action failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="More options"
        aria-label="Report or block this user"
        style={{ width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)", border: "1px solid var(--admin-border-light)", cursor: "pointer", transition: "all 0.15s" }}
      >
        <MoreVertical style={{ width: 16, height: 16 }} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-away backdrop */}
            <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              style={{ position: "absolute", right: 0, top: 40, zIndex: 50, width: 240, borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}
            >
              {reporting ? (
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>Report {targetName}</span>
                    <button onClick={() => setReporting(false)} aria-label="Cancel" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-font-light)", display: "flex" }}>
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="What's wrong? (e.g. harassment, inappropriate contact)"
                    rows={3}
                    maxLength={1000}
                    autoFocus
                    style={{ resize: "none", borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", padding: "8px 10px", fontSize: 12, color: "var(--admin-font-primary)", fontFamily: "inherit", outline: "none", lineHeight: 1.4 }}
                  />
                  <button
                    onClick={handleReport}
                    disabled={!reason.trim() || submitting}
                    style={{ borderRadius: 8, border: "none", padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "#fff", background: reason.trim() && !submitting ? "#dc2626" : "var(--admin-font-light)", cursor: reason.trim() && !submitting ? "pointer" : "default", fontFamily: "inherit" }}
                  >
                    {submitting ? "Submitting…" : "Submit report"}
                  </button>
                </div>
              ) : (
                <div style={{ padding: 4 }}>
                  <button
                    onClick={() => setReporting(true)}
                    style={menuItemStyle}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Flag style={{ width: 15, height: 15, color: "var(--admin-font-tertiary)" }} />
                    <span>Report {targetName}</span>
                  </button>
                  <button
                    onClick={handleBlockToggle}
                    disabled={submitting}
                    style={{ ...menuItemStyle, color: blocked ? "var(--admin-font-primary)" : "#dc2626" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Ban style={{ width: 15, height: 15 }} />
                    <span>{blocked ? `Unblock ${targetName}` : `Block ${targetName}`}</span>
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 10px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  color: "var(--admin-font-primary)",
  textAlign: "left",
  transition: "background 0.1s",
};
