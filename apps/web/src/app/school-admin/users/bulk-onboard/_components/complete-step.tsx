"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileSpreadsheet,
  Users,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import type { OnboardResult } from "./types";

interface CompleteStepProps {
  onboardResult: OnboardResult;
  onReset: () => void;
  card: React.CSSProperties;
}

export function CompleteStep({ onboardResult, onReset, card }: CompleteStepProps) {
  const [expandedResults, setExpandedResults] = useState(false);

  return (
    <motion.div
      key="step-complete"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      {/* Success hero */}
      <div style={{ ...card, textAlign: "center", padding: "48px 32px" }}>
        <motion.div
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
          style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(20,184,166,0.15))",
            border: "2px solid rgba(16,185,129,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 0 40px rgba(16,185,129,0.2)",
          }}
        >
          <CheckCircle style={{ width: 40, height: 40, color: "#10b981" }} />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ fontSize: 26, fontWeight: 800, color: "var(--admin-font-primary)", letterSpacing: "-0.02em", marginBottom: 8 }}
        >
          Onboarding Complete!
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginBottom: 28 }}
        >
          Invite emails have been sent to all new students.
        </motion.p>

        {/* Stats grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-lg mx-auto"
        >
          {[
            { label: "Created", value: onboardResult.created, color: "#10b981", bg: "rgba(16,185,129,0.1)" },
            { label: "Linked", value: onboardResult.linked, color: "#14b8a6", bg: "rgba(20,184,166,0.1)" },
            { label: "Updated", value: onboardResult.updated, color: "#0ea5e9", bg: "rgba(14,165,233,0.1)" },
            { label: "Failed", value: onboardResult.failed, color: onboardResult.failed > 0 ? "#ef4444" : "var(--admin-font-tertiary)", bg: onboardResult.failed > 0 ? "rgba(239,68,68,0.1)" : "var(--admin-bg-hover)" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ padding: "16px 12px", borderRadius: 10, background: stat.bg, border: `1px solid ${stat.bg}` }}
            >
              <div style={{ fontSize: 28, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Expandable results */}
      {onboardResult.results && onboardResult.results.length > 0 && (
        <div style={card}>
          <button
            onClick={() => setExpandedResults((v) => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <FileSpreadsheet style={{ width: 15, height: 15, color: "#14b8a6" }} />
              Per-student results ({onboardResult.results.length})
            </span>
            {expandedResults ? (
              <ChevronUp style={{ width: 16, height: 16, color: "var(--admin-font-light)" }} />
            ) : (
              <ChevronDown style={{ width: 16, height: 16, color: "var(--admin-font-light)" }} />
            )}
          </button>

          <AnimatePresence>
            {expandedResults && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <div style={{ marginTop: 14, borderRadius: 8, border: "1px solid var(--admin-border-default)", overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--admin-bg-hover)", borderBottom: "1px solid var(--admin-border-default)" }}>
                        {["Name", "Email", "Result"].map((h) => (
                          <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--admin-font-tertiary)", textAlign: "left" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {onboardResult.results.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                          <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--admin-font-primary)", fontWeight: 500 }}>{r.name}</td>
                          <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--admin-font-secondary)", fontFamily: "monospace" }}>{r.email}</td>
                          <td style={{ padding: "8px 12px" }}>
                            {r.status === "created" || r.status === "linked" || r.status === "updated" ? (
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(16,185,129,0.1)", color: "#10b981", fontWeight: 600, textTransform: "capitalize" }}>
                                {r.status}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontWeight: 600 }}>
                                {r.error || "Failed"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-center flex-wrap">
        <a
          href="/school-admin/users"
          style={{
            height: 42, borderRadius: 8, padding: "0 24px", fontSize: 14, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg, #14b8a6, #0ea5e9)",
            color: "#fff", textDecoration: "none",
            boxShadow: "0 2px 12px rgba(14,165,233,0.25)",
          }}
        >
          <Users style={{ width: 16, height: 16 }} />
          View Students
        </a>
        <button
          onClick={onReset}
          style={{
            height: 42, borderRadius: 8, padding: "0 24px", fontSize: 14, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
            color: "var(--admin-font-secondary)", cursor: "pointer",
          }}
        >
          <RotateCcw style={{ width: 15, height: 15 }} />
          Onboard More Students
        </button>
      </div>
    </motion.div>
  );
}
