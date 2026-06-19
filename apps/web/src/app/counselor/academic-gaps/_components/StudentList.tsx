"use client";

import { motion } from "motion/react";
import { Search, Layers } from "lucide-react";
import { MiniBar } from "./GapHelpers";
import type { AcademicGapSummaryItem, StudentAcademicStatus } from "@/types/academicGap";

const statusStyles: Record<StudentAcademicStatus, { color: string; bg: string; label: string }> = {
  off_track: { color: "#ef4444", bg: "rgba(239,68,68,0.1)",  label: "Off Track" },
  at_risk:   { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "At Risk" },
  on_track:  { color: "#10b981", bg: "rgba(16,185,129,0.1)", label: "On Track" },
};

export function StudentList({
  students,
  selectedStudentId,
  onSelectStudent,
  searchQuery,
  onSearchChange,
  totalStudents,
}: {
  students: AcademicGapSummaryItem[];
  selectedStudentId: string;
  onSelectStudent: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  totalStudents: number;
}) {
  return (
    <div style={{
      background: "var(--admin-bg-card, #fff)",
      border: "1px solid var(--admin-border-default, rgba(0,0,0,0.08))",
      borderRadius: 12,
      overflow: "hidden",
      position: "sticky" as const,
      top: 80,
      maxHeight: "calc(100vh - 120px)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header + search */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--admin-border-default, rgba(0,0,0,0.08))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <Layers style={{ width: 14, height: 14, color: "#065292" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--admin-font-primary, #111)" }}>Needs Review</span>
          <span style={{
            fontSize: 10, fontWeight: 600, marginLeft: "auto",
            color: "var(--admin-font-tertiary, #888)",
          }}>
            {students.length} students
          </span>
        </div>
        <div style={{ position: "relative" as const }}>
          <Search style={{
            width: 14, height: 14, color: "var(--admin-font-tertiary, #888)",
            position: "absolute" as const, left: 10, top: "50%", transform: "translateY(-50%)",
          }} />
          <input
            type="text"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: "100%", height: 34, borderRadius: 8,
              border: "1px solid var(--admin-border-default, rgba(0,0,0,0.1))",
              background: "var(--admin-bg-hover, rgba(0,0,0,0.02))",
              paddingLeft: 32, paddingRight: 10,
              fontSize: 12, color: "var(--admin-font-primary, #111)",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Student list */}
      <div style={{ flex: 1, overflowY: "auto" as const, padding: 8 }}>
        {students.length > 0 ? (
          students.map((s: AcademicGapSummaryItem, index: number) => {
            const isSelected = selectedStudentId === s.studentId;
            const st = statusStyles[s.overallStatus] || statusStyles.on_track;
            return (
              <motion.button
                key={s.studentId || `gap-${index}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => onSelectStudent(s.studentId)}
                style={{
                  width: "100%", textAlign: "left" as const,
                  padding: "10px 12px", borderRadius: 8,
                  marginBottom: 2, cursor: "pointer",
                  border: isSelected ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
                  background: isSelected ? "rgba(99,102,241,0.08)" : "transparent",
                  display: "flex", flexDirection: "column", gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                {/* Row 1: Name + status */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: isSelected ? "#065292" : "var(--admin-bg-hover, rgba(0,0,0,0.05))",
                    color: isSelected ? "#fff" : "var(--admin-font-primary, #111)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700,
                  }}>
                    {(s.studentName || "??").substring(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 12, fontWeight: 600, margin: 0,
                      color: isSelected ? "#065292" : "var(--admin-font-primary, #111)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                    }}>
                      {s.studentName}
                    </p>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                    textTransform: "uppercase" as const,
                    color: st.color, background: st.bg,
                    padding: "2px 6px", borderRadius: 4,
                    flexShrink: 0,
                  }}>
                    {st.label}
                  </span>
                </div>

                {/* Row 2: Credit bar + gap count */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 38 }}>
                  <div style={{ flex: 1 }}>
                    <MiniBar
                      earned={Math.max(0, (totalStudents ?? 24) - s.creditDeficit)}
                      required={totalStudents ?? 24}
                      color={s.overallStatus === "off_track" ? "#ef4444" : s.overallStatus === "at_risk" ? "#f59e0b" : "#10b981"}
                    />
                  </div>
                  {s.missingRequiredCourses > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: "var(--admin-font-tertiary, #888)",
                      flexShrink: 0,
                    }}>
                      {s.missingRequiredCourses} gaps
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })
        ) : (
          <div style={{ textAlign: "center", padding: "40px 16px" }}>
            <Search style={{ width: 20, height: 20, color: "var(--admin-font-tertiary, #888)", margin: "0 auto 8px", opacity: 0.4 }} />
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary, #111)", margin: 0 }}>No students found</p>
            <p style={{ fontSize: 11, color: "var(--admin-font-tertiary, #888)", margin: "4px 0 0" }}>Try adjusting your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
