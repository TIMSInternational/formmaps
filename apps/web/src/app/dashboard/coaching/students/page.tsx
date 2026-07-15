"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Search, Users, MessageCircle, CalendarPlus, AlertCircle } from "lucide-react";
import { getCoachStudents } from "@/services/coachService";
import { unwrapList } from "@/lib/unwrapList";
import type { StudentSummary } from "@/types/coach";
import { getInitials } from "@/lib/stringUtils";

export default function CoachStudentsPage() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStudents() {
      setLoading(true);
      setError(null);
      try {
        const res = await getCoachStudents({ search: search || undefined });
        // res is { data: { students, total } }; the old `res?.data ?? res`
        // grabbed the { students, total } object (not an array) → always empty.
        setStudents(unwrapList(res, "students") as StudentSummary[]);
      } catch {
        setError("Failed to load students");
        setStudents([]);
      } finally {
        setLoading(false);
      }
    }
    const timeout = setTimeout(fetchStudents, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "No sessions yet";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Loading state
  if (loading && students.length === 0) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ height: 32, width: 200, borderRadius: 6, background: "var(--admin-bg-card-hover)", animation: "pulse 1.5s infinite" }} />
        <div style={{ height: 48, width: "100%", maxWidth: 400, borderRadius: 8, background: "var(--admin-bg-card-hover)", animation: "pulse 1.5s infinite" }} />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 80, width: "100%", borderRadius: 8, background: "var(--admin-bg-card-hover)", animation: "pulse 1.5s infinite" }} />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, minHeight: 300 }}>
        <AlertCircle style={{ width: 40, height: 40, color: "#dc2626" }} />
        <p style={{ fontSize: 15, fontWeight: 500, color: "var(--admin-font-primary)" }}>{error}</p>
        <button
          onClick={() => setSearch("")}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: "#102B47", color: "#fff", fontSize: 13,
            fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--admin-font-tertiary)", marginBottom: 4 }}>
          Coaching
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", margin: 0 }}>
          My Students
        </h1>
        <p style={{ fontSize: 14, color: "var(--admin-font-secondary)", marginTop: 4 }}>
          View and manage your coaching students.
        </p>
      </motion.div>

      {/* Search bar */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div style={{ position: "relative", maxWidth: 400 }}>
          <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
          <input
            type="text"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", height: 40, padding: "0 12px 0 36px",
              borderRadius: 8, border: "1px solid var(--admin-border-light, #e5e7eb)",
              background: "var(--admin-bg-panel)", color: "var(--admin-font-primary)",
              fontSize: 14, fontFamily: "inherit", outline: "none",
            }}
          />
        </div>
      </motion.div>

      {/* Students grid */}
      {students.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 12, padding: 48,
            borderRadius: 12, border: "1px dashed var(--admin-border-light, #e5e7eb)",
            background: "var(--admin-bg-panel)",
          }}
        >
          <Users style={{ width: 40, height: 40, color: "var(--admin-font-tertiary)" }} />
          <p style={{ fontSize: 15, fontWeight: 500, color: "var(--admin-font-primary)" }}>No students found</p>
          <p style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>
            {search ? "Try a different search term." : "Students will appear here once they book sessions with you."}
          </p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {students.map((student, idx) => (
            <motion.div
              key={student.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * idx }}
              style={{
                display: "flex", flexDirection: "column", gap: 12,
                padding: 16, borderRadius: 12,
                border: "1px solid var(--admin-border-light, #e5e7eb)",
                background: "var(--admin-bg-panel)",
                transition: "box-shadow 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
            >
              {/* Student info row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", background: "#102B47",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 700, flexShrink: 0,
                }}>
                  {getInitials(student.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {student.name}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {student.email}
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", margin: 0 }}>Sessions</p>
                  <p style={{ fontSize: 16, fontWeight: 600, color: "#2E9098", margin: 0 }}>
                    {student.totalSessions ?? 0}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", margin: 0 }}>Last Session</p>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-secondary)", margin: 0 }}>
                    {formatDate(student.lastSessionDate ?? null)}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 6, border: "1px solid var(--admin-border-light, #e5e7eb)",
                    background: "var(--admin-bg-panel)", color: "var(--admin-font-secondary)",
                    fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover, #f5f5f5)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--admin-bg-panel)"; }}
                >
                  <MessageCircle style={{ width: 14, height: 14 }} />
                  Message
                </button>
                <button
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 6, border: "none",
                    background: "#102B47", color: "#fff",
                    fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                    transition: "opacity 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                >
                  <CalendarPlus style={{ width: 14, height: 14 }} />
                  Schedule Session
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
