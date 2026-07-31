"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Plus,
  Loader2,
  ArrowRight,
  RotateCcw,
  UserCheck,
  Users,
  AlertCircle,
} from "lucide-react";
import type { PreviewResult } from "./types";

interface PreviewStepProps {
  previewResult: PreviewResult;
  excludedEmails: Set<string>;
  setExcludedEmails: React.Dispatch<React.SetStateAction<Set<string>>>;
  isOnboarding: boolean;
  onOnboard: () => void;
  onBack: () => void;
  card: React.CSSProperties;
}

export function PreviewStep({
  previewResult,
  excludedEmails,
  setExcludedEmails,
  isOnboarding,
  onOnboard,
  onBack,
  card,
}: PreviewStepProps) {
  const errorRowRef = useRef<HTMLTableRowElement>(null);

  const visibleStudents = previewResult.students.filter((s) => !excludedEmails.has(s.email));
  const readyCount = visibleStudents.filter((s) => s.status === "new").length;
  const existingCount = visibleStudents.filter((s) => s.status === "existing").length;
  const errorCount = previewResult.students.filter(
    (s) => s.status === "error" && !excludedEmails.has(s.email)
  ).length;

  const scrollToErrors = () => errorRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <motion.div
      key="step-preview"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Summary bar */}
      <div style={{ ...card, padding: "16px 24px" }}>
        <div className="flex flex-wrap items-center gap-4">
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <CheckCircle style={{ width: 16, height: 16, color: "#10b981" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>{readyCount} new</span>
          </div>
          {existingCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)" }}>
              <AlertTriangle style={{ width: 16, height: 16, color: "#eab308" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#eab308" }}>{existingCount} existing</span>
              <span style={{ fontSize: 11, color: "#a16207" }}>will update grade</span>
            </div>
          )}
          {errorCount > 0 && (
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer" }}
              onClick={scrollToErrors}
            >
              <XCircle style={{ width: 16, height: 16, color: "#ef4444" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#ef4444" }}>{errorCount} errors</span>
              <span style={{ fontSize: 11, color: "#b91c1c" }}>click to fix</span>
            </div>
          )}
          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={onBack}
              style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)", fontWeight: 500 }}
            >
              <RotateCcw style={{ width: 12, height: 12 }} />
              Edit Upload
            </button>
          </div>
        </div>
      </div>

      {/* Counselor distribution */}
      {previewResult.counselors && previewResult.counselors.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <UserCheck style={{ width: 15, height: 15, color: "#14b8a6" }} />
            Counselor Assignment Preview
            <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>
              — distributed across {previewResult.counselors.length} counselor{previewResult.counselors.length !== 1 ? "s" : ""}
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {previewResult.counselors.map((c, i) => (
              <div
                key={i}
                style={{ padding: "12px 14px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}
              >
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 6 }}>{c.name}</p>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Current:</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)" }}>{c.currentCount}</span>
                  <ArrowRight style={{ width: 12, height: 12, color: "var(--admin-font-light)" }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#14b8a6" }}>{c.currentCount + c.newCount}</span>
                  {c.newCount > 0 && (
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 12, background: "rgba(20,184,166,0.12)", color: "#14b8a6", fontWeight: 600 }}>
                      +{c.newCount}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Student preview table */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Users style={{ width: 15, height: 15, color: "#14b8a6" }} />
          Student Preview
          <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>
            — {previewResult.students.length} total
          </span>
        </h3>
        <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", overflow: "hidden" }}>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                <tr style={{ background: "var(--admin-bg-hover)", borderBottom: "1px solid var(--admin-border-default)" }}>
                  {["Status", "Name", "Email", "Class Level", "Counselor", ""].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--admin-font-tertiary)", textAlign: "left", background: "var(--admin-bg-hover)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewResult.students.map((s, i) => {
                  const excluded = excludedEmails.has(s.email);
                  const isError = s.status === "error";
                  const isExisting = s.status === "existing";
                  const rowBg = excluded
                    ? "transparent"
                    : isError
                    ? "rgba(239,68,68,0.04)"
                    : isExisting
                    ? "rgba(234,179,8,0.04)"
                    : "rgba(16,185,129,0.03)";
                  const borderColor = excluded
                    ? "var(--admin-border-default)"
                    : isError
                    ? "rgba(239,68,68,0.15)"
                    : isExisting
                    ? "rgba(234,179,8,0.15)"
                    : "rgba(16,185,129,0.12)";

                  return (
                    <tr
                      key={i}
                      ref={isError && !excludedEmails.has(s.email) ? errorRowRef : undefined}
                      style={{
                        borderBottom: `1px solid ${borderColor}`,
                        background: rowBg,
                        opacity: excluded ? 0.4 : 1,
                        transition: "all 0.15s",
                      }}
                    >
                      <td style={{ padding: "10px 12px" }}>
                        {isError ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <XCircle style={{ width: 14, height: 14, color: "#ef4444", flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Error</span>
                          </div>
                        ) : isExisting ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <AlertTriangle style={{ width: 14, height: 14, color: "#eab308", flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: "#eab308", fontWeight: 600 }}>Existing</span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <CheckCircle style={{ width: 14, height: 14, color: "#10b981", flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>New</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                        {s.name || <span style={{ color: "var(--admin-font-light)", fontStyle: "italic" }}>&mdash;</span>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--admin-font-secondary)", fontFamily: "monospace" }}>
                        {s.email}
                        {isError && s.error && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                            <AlertCircle style={{ width: 11, height: 11, color: "#ef4444" }} />
                            <span style={{ fontSize: 11, color: "#ef4444" }}>{s.error}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)", fontWeight: 500 }}>
                          {s.classLevel || "\u2014"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                        {s.counselorName || "\u2014"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button
                          onClick={() =>
                            setExcludedEmails((prev) => {
                              const next = new Set(prev);
                              if (next.has(s.email)) next.delete(s.email);
                              else next.add(s.email);
                              return next;
                            })
                          }
                          title={excluded ? "Include" : "Remove from import"}
                          style={{
                            width: 26, height: 26, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
                            background: "transparent", border: "1px solid var(--admin-border-default)",
                            color: excluded ? "#10b981" : "#ef4444", cursor: "pointer",
                          }}
                        >
                          {excluded ? <Plus style={{ width: 11, height: 11 }} /> : <XCircle style={{ width: 11, height: 11 }} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Onboard CTA */}
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
            Ready to onboard{" "}
            <span style={{ color: "#14b8a6" }}>{readyCount + existingCount}</span> students
          </p>
          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            {readyCount} new accounts will be created
            {existingCount > 0 ? `, ${existingCount} existing will be updated` : ""}
            {errorCount > 0 ? `, ${errorCount} errors excluded` : ""}
          </p>
        </div>
        <button
          onClick={onOnboard}
          disabled={isOnboarding || (readyCount + existingCount) === 0}
          style={{
            height: 44, borderRadius: 8, padding: "0 28px", fontSize: 15, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 10,
            background: (readyCount + existingCount) === 0 ? "var(--admin-bg-hover)" : "linear-gradient(135deg, #14b8a6, #0ea5e9)",
            color: (readyCount + existingCount) === 0 ? "var(--admin-font-light)" : "#fff",
            border: (readyCount + existingCount) === 0 ? "1px solid var(--admin-border-default)" : "none",
            cursor: isOnboarding || (readyCount + existingCount) === 0 ? "not-allowed" : "pointer",
            opacity: isOnboarding ? 0.8 : 1,
            boxShadow: (readyCount + existingCount) > 0 ? "0 4px 16px rgba(14,165,233,0.3)" : "none",
            transition: "all 0.2s",
          }}
        >
          {isOnboarding ? (
            <>
              <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
              Onboarding&hellip;
            </>
          ) : (
            <>
              <Users style={{ width: 18, height: 18 }} />
              Onboard {readyCount + existingCount} Students
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
