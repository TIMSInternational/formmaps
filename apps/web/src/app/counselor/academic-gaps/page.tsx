"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  TrendingDown,
  BookOpen,
  AlertTriangle,
  Target,
  Users,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Layers,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  useAcademicGapSummary,
  useStudentAcademicGaps,
  useStudentCourseRecommendations,
} from "@/hooks/useAcademicGapQueries";
import type { AcademicGapSummaryItem } from "@/types/academicGap";

// ── Status helpers ──────────────────────────────────────────────────

const statusStyles: Record<string, { color: string; bg: string; label: string }> = {
  behind:  { color: "#ef4444", bg: "rgba(239,68,68,0.1)",  label: "Behind" },
  at_risk: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "At Risk" },
  on_track:{ color: "#10b981", bg: "rgba(16,185,129,0.1)", label: "On Track" },
};

const severityOrder: Record<string, number> = { behind: 0, at_risk: 1, on_track: 2 };

// ── Stat Card ───────────────────────────────────────────────────────

function StatCard({ label, value, color, icon: Icon, delay }: {
  label: string; value: number; color: string; icon: any; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      style={{
        background: "var(--admin-bg-card, #fff)",
        border: "1px solid var(--admin-border-default, rgba(0,0,0,0.08))",
        borderRadius: 12,
        padding: "16px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${color}15`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon style={{ width: 15, height: 15, color }} strokeWidth={1.8} />
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
          color: "var(--admin-font-tertiary, #888)",
        }}>{label}</span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary, #111)", letterSpacing: "-0.02em" }}>{value}</p>
    </motion.div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────

function Skeleton({ width, height, radius = 10 }: { width?: string | number; height: number; radius?: number }) {
  return (
    <div style={{
      width: width ?? "100%", height, borderRadius: radius,
      background: "var(--admin-bg-hover, rgba(0,0,0,0.05))",
      animation: "pulse 1.5s ease-in-out infinite",
    }} />
  );
}

// ── Mini progress bar ───────────────────────────────────────────────

function MiniBar({ earned, required, color = "#6366f1", height = 4 }: {
  earned: number; required: number; color?: string; height?: number;
}) {
  const pct = required > 0 ? Math.min(100, (earned / required) * 100) : 0;
  return (
    <div style={{
      height, borderRadius: height / 2, width: "100%",
      background: "var(--admin-bg-hover, rgba(0,0,0,0.06))", overflow: "hidden",
    }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: height / 2,
        background: color, transition: "width 0.4s ease",
      }} />
    </div>
  );
}

// ── Expandable gap card ─────────────────────────────────────────────

function GapCategoryCard({ gap, recommendations, index }: {
  gap: { category: string; creditsEarned: number; creditsRequired: number; deficit: number };
  recommendations: any[];
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const matching = recommendations.filter(
    (r: any) => (r.category || "").toLowerCase() === (gap.category || "").toLowerCase()
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      style={{
        borderRadius: 10,
        border: "1px solid rgba(239,68,68,0.2)",
        background: "var(--admin-bg-card, #fff)",
        overflow: "hidden",
      }}
    >
      {/* Left accent */}
      <div style={{ display: "flex" }}>
        <div style={{ width: 4, background: "#ef4444", flexShrink: 0 }} />
        <div style={{ flex: 1, padding: "14px 16px" }}>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "var(--admin-font-primary, #111)" }}>
              {gap.category}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#ef4444",
              background: "rgba(239,68,68,0.1)", padding: "2px 8px", borderRadius: 4,
            }}>
              -{gap.deficit} credits
            </span>
          </div>

          {/* Progress bar */}
          <MiniBar earned={gap.creditsEarned} required={gap.creditsRequired} color="#ef4444" height={6} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary, #888)" }}>
              Earned: {gap.creditsEarned}
            </span>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary, #888)" }}>
              Required: {gap.creditsRequired}
            </span>
          </div>

          {/* Expand button */}
          {matching.length > 0 && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  marginTop: 10, display: "flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: 600, color: "#6366f1",
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                }}
              >
                {expanded ? <ChevronDown style={{ width: 13, height: 13 }} /> : <ChevronRight style={{ width: 13, height: 13 }} />}
                {expanded ? "Hide" : "View"} courses to fill this gap ({matching.length})
              </button>

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: "hidden", marginTop: 8 }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {matching.map((r: any, i: number) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 10px", borderRadius: 6,
                          background: "var(--admin-bg-hover, rgba(0,0,0,0.03))",
                          border: "1px solid var(--admin-border-default, rgba(0,0,0,0.06))",
                        }}>
                          <BookOpen style={{ width: 13, height: 13, color: "#6366f1", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary, #111)" }}>
                              {r.courseName}
                            </span>
                            <span style={{ fontSize: 10, color: "var(--admin-font-tertiary, #888)", marginLeft: 6, fontFamily: "monospace" }}>
                              {r.courseCode}
                            </span>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: "#6366f1",
                            background: "rgba(99,102,241,0.1)", padding: "2px 6px", borderRadius: 4,
                            flexShrink: 0,
                          }}>
                            {r.credits} cr
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Main Page Component
// ════════════════════════════════════════════════════════════════════

export default function AcademicGapsPage() {
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: summary, isLoading: summaryLoading } = useAcademicGapSummary({ limit: 50 });
  const { data: gaps, isLoading: gapsLoading } = useStudentAcademicGaps(selectedStudentId);
  const { data: recs, isLoading: recsLoading } = useStudentCourseRecommendations(selectedStudentId);

  // Sort students: behind > at_risk > on_track, then filter by search
  const sortedStudents = useMemo(() => {
    const list = summary?.data || [];
    return [...list]
      .filter((s: AcademicGapSummaryItem) =>
        (s.studentName || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a: AcademicGapSummaryItem, b: AcademicGapSummaryItem) =>
        (severityOrder[a.overallStatus] ?? 9) - (severityOrder[b.overallStatus] ?? 9)
      );
  }, [summary?.data, searchQuery]);

  // Flatten recommendations for inline display
  const allRecs = useMemo(() => {
    if (!recs) return [];
    return [...(recs.nextSemester || []), ...(recs.longTerm || [])];
  }, [recs]);

  // ── Loading state ──
  if (summaryLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height={80} />)}
        </div>
        <Skeleton height={500} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Summary Stat Cards ── */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatCard label="Total Students" value={summary.summary?.totalStudents ?? 0} color="#6366f1" icon={Users} delay={0.05} />
          <StatCard label="Behind" value={summary.summary?.behind ?? 0} color="#ef4444" icon={AlertCircle} delay={0.1} />
          <StatCard label="At Risk" value={summary.summary?.atRisk ?? 0} color="#f59e0b" icon={AlertTriangle} delay={0.15} />
          <StatCard label="On Track" value={summary.summary?.onTrack ?? 0} color="#10b981" icon={CheckCircle2} delay={0.2} />
        </div>
      )}

      {/* ── Split Panel ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" }}
      >

        {/* ── Left: Student List ── */}
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
              <Layers style={{ width: 14, height: 14, color: "#6366f1" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--admin-font-primary, #111)" }}>Needs Review</span>
              <span style={{
                fontSize: 10, fontWeight: 600, marginLeft: "auto",
                color: "var(--admin-font-tertiary, #888)",
              }}>
                {sortedStudents.length} students
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
                onChange={(e) => setSearchQuery(e.target.value)}
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
            {sortedStudents.length > 0 ? (
              sortedStudents.map((s: AcademicGapSummaryItem, index: number) => {
                const isSelected = selectedStudentId === s.studentId;
                const st = statusStyles[s.overallStatus] || statusStyles.on_track;
                return (
                  <motion.button
                    key={s.studentId || `gap-${index}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => setSelectedStudentId(s.studentId)}
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
                        background: isSelected ? "#6366f1" : "var(--admin-bg-hover, rgba(0,0,0,0.05))",
                        color: isSelected ? "#fff" : "var(--admin-font-primary, #111)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 700,
                      }}>
                        {(s.studentName || "??").substring(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 12, fontWeight: 600, margin: 0,
                          color: isSelected ? "#6366f1" : "var(--admin-font-primary, #111)",
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
                          earned={Math.max(0, (summary?.summary?.totalStudents ?? 24) - s.creditDeficit)}
                          required={summary?.summary?.totalStudents ?? 24}
                          color={s.overallStatus === "behind" ? "#ef4444" : s.overallStatus === "at_risk" ? "#f59e0b" : "#10b981"}
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

        {/* ── Right: Detail View ── */}
        <div style={{ minHeight: 460 }}>
          <AnimatePresence mode="wait">
            {!selectedStudentId ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                style={{
                  height: 460, borderRadius: 12,
                  border: "2px dashed var(--admin-border-default, rgba(0,0,0,0.1))",
                  background: "var(--admin-bg-card, #fff)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <div style={{ textAlign: "center", maxWidth: 300 }}>
                  <Target style={{ width: 36, height: 36, color: "var(--admin-font-tertiary, #888)", margin: "0 auto 12px", opacity: 0.35 }} />
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary, #111)", margin: "0 0 6px" }}>
                    Select a Student
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--admin-font-tertiary, #888)", lineHeight: 1.5, margin: 0 }}>
                    Choose a student from the list to view their credit gaps, missing coursework, and recommended courses.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={selectedStudentId}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >

                {/* ── Credit Summary Card ── */}
                {gapsLoading ? (
                  <Skeleton height={110} />
                ) : gaps ? (
                  <div style={{
                    background: "var(--admin-bg-card, #fff)",
                    border: "1px solid var(--admin-border-default, rgba(0,0,0,0.08))",
                    borderRadius: 12, padding: "20px 24px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div>
                        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary, #111)", margin: 0 }}>
                          {(gaps as any).studentName || "Student"}
                        </h2>
                        {(gaps as any).gradeLevel && (
                          <p style={{ fontSize: 11, color: "var(--admin-font-tertiary, #888)", margin: "2px 0 0" }}>
                            Grade {(gaps as any).gradeLevel}
                          </p>
                        )}
                      </div>
                      {(gaps as any).creditsRequired > 0 && (
                        <div style={{ textAlign: "right" as const }}>
                          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--admin-font-primary, #111)" }}>
                            {Math.round(((gaps as any).creditsEarned / (gaps as any).creditsRequired) * 100)}%
                          </span>
                          <p style={{ fontSize: 11, color: "var(--admin-font-tertiary, #888)", margin: "2px 0 0" }}>
                            {(gaps as any).creditsEarned} / {(gaps as any).creditsRequired} credits
                          </p>
                        </div>
                      )}
                    </div>
                    {(gaps as any).creditsRequired > 0 && (
                      <MiniBar
                        earned={(gaps as any).creditsEarned}
                        required={(gaps as any).creditsRequired}
                        color="#6366f1"
                        height={8}
                      />
                    )}
                    {((gaps as any).creditsRequired - (gaps as any).creditsEarned) > 0 && (
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", margin: "6px 0 0" }}>
                        {(gaps as any).creditsRequired - (gaps as any).creditsEarned} credits remaining to graduate
                      </p>
                    )}
                  </div>
                ) : null}

                {/* ── Gap Categories ── */}
                {gapsLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <Skeleton height={90} />
                    <Skeleton height={90} />
                  </div>
                ) : gaps ? (
                  <>
                    {/* Credit gaps */}
                    {gaps.creditGaps?.length > 0 && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 7,
                            background: "rgba(239,68,68,0.1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <TrendingDown style={{ width: 14, height: 14, color: "#ef4444" }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--admin-font-primary, #111)" }}>
                            Credit Deficiencies
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: "#ef4444",
                            background: "rgba(239,68,68,0.1)", padding: "2px 6px", borderRadius: 4,
                          }}>
                            {gaps.creditGaps.length} categories
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          {gaps.creditGaps.map((g, i) => (
                            <GapCategoryCard key={i} gap={g} recommendations={allRecs} index={i} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Course gaps */}
                    {gaps.courseGaps?.length > 0 && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 7,
                            background: "rgba(245,158,11,0.1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <BookOpen style={{ width: 14, height: 14, color: "#f59e0b" }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--admin-font-primary, #111)" }}>
                            Missing Required Courses
                          </span>
                        </div>
                        <div style={{
                          padding: 14, borderRadius: 10,
                          border: "1px solid rgba(245,158,11,0.2)",
                          background: "var(--admin-bg-card, #fff)",
                          display: "flex", flexWrap: "wrap", gap: 8,
                        }}>
                          {gaps.courseGaps.map((g, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: i * 0.04 }}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                padding: "5px 10px", borderRadius: 6,
                                background: "var(--admin-bg-hover, rgba(0,0,0,0.03))",
                                border: "1px solid var(--admin-border-default, rgba(0,0,0,0.06))",
                              }}
                            >
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary, #111)" }}>
                                {g.courseName}
                              </span>
                              <span style={{
                                fontSize: 10, fontFamily: "monospace", color: "#f59e0b",
                                background: "rgba(245,158,11,0.1)", padding: "1px 5px", borderRadius: 3,
                              }}>
                                {g.courseCode}
                              </span>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Career gaps */}
                    {gaps.careerGaps?.length > 0 && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 7,
                            background: "rgba(168,85,247,0.1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <Briefcase style={{ width: 14, height: 14, color: "#a855f7" }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--admin-font-primary, #111)" }}>
                            Career Alignment Warnings
                          </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {gaps.careerGaps.map((g, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: 12 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.08 }}
                              style={{
                                padding: 14, borderRadius: 10,
                                border: "1px solid rgba(168,85,247,0.2)",
                                background: "var(--admin-bg-card, #fff)",
                                display: "flex", alignItems: "flex-start", gap: 10,
                              }}
                            >
                              <Target style={{ width: 16, height: 16, color: "#a855f7", flexShrink: 0, marginTop: 1 }} />
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--admin-font-primary, #111)", margin: 0 }}>
                                  {g.careerPath}
                                </p>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                                  {g.missingSkills.map((skill, idx) => (
                                    <span key={idx} style={{
                                      fontSize: 10, fontWeight: 600, color: "#a855f7",
                                      background: "rgba(168,85,247,0.1)", padding: "2px 7px", borderRadius: 4,
                                    }}>
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* All good */}
                    {(gaps.creditGaps?.length ?? 0) === 0 && (gaps.courseGaps?.length ?? 0) === 0 && (gaps.careerGaps?.length ?? 0) === 0 && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{
                          padding: "32px 20px", borderRadius: 12, textAlign: "center",
                          border: "1px solid rgba(16,185,129,0.2)",
                          background: "rgba(16,185,129,0.04)",
                        }}
                      >
                        <CheckCircle2 style={{ width: 28, height: 28, color: "#10b981", margin: "0 auto 8px" }} />
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-font-primary, #111)", margin: "0 0 4px" }}>
                          Student is On Track
                        </h3>
                        <p style={{ fontSize: 12, color: "var(--admin-font-tertiary, #888)", margin: 0, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
                          No academic gaps, missing requirements, or career alignment issues detected.
                        </p>
                      </motion.div>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <AlertCircle style={{ width: 28, height: 28, color: "var(--admin-font-tertiary, #888)", margin: "0 auto 8px", opacity: 0.4 }} />
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-tertiary, #888)", margin: 0 }}>
                      Unable to load gap data.
                    </p>
                  </div>
                )}

                {/* ── Recommended Courses (inline) ── */}
                {selectedStudentId && (
                  <div style={{
                    background: "var(--admin-bg-card, #fff)",
                    border: "1px solid var(--admin-border-default, rgba(0,0,0,0.08))",
                    borderRadius: 12, overflow: "hidden",
                  }}>
                    <div style={{
                      padding: "14px 20px",
                      borderBottom: "1px solid var(--admin-border-default, rgba(0,0,0,0.08))",
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 7,
                        background: "rgba(16,185,129,0.1)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <BookOpen style={{ width: 14, height: 14, color: "#10b981" }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--admin-font-primary, #111)" }}>
                        Recommended Courses
                      </span>
                      {allRecs.length > 0 && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, color: "#10b981",
                          background: "rgba(16,185,129,0.1)", padding: "2px 6px", borderRadius: 4,
                        }}>
                          {allRecs.length} courses
                        </span>
                      )}
                    </div>

                    <div style={{ padding: 16 }}>
                      {recsLoading ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <Skeleton height={56} />
                          <Skeleton height={56} />
                          <Skeleton height={56} />
                        </div>
                      ) : allRecs.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {allRecs.map((r: any, i: number) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.04 }}
                              style={{
                                padding: "10px 14px", borderRadius: 8,
                                border: "1px solid var(--admin-border-default, rgba(0,0,0,0.06))",
                                background: "var(--admin-bg-hover, rgba(0,0,0,0.015))",
                                display: "flex", alignItems: "center", gap: 12,
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--admin-font-primary, #111)" }}>
                                    {r.courseName}
                                  </span>
                                  <span style={{
                                    fontSize: 10, fontFamily: "monospace", fontWeight: 600,
                                    color: "var(--admin-font-tertiary, #888)",
                                    background: "var(--admin-bg-card, #fff)",
                                    padding: "1px 6px", borderRadius: 3,
                                    border: "1px solid var(--admin-border-default, rgba(0,0,0,0.08))",
                                  }}>
                                    {r.courseCode}
                                  </span>
                                </div>
                                {r.reason && (
                                  <p style={{ fontSize: 11, color: "var(--admin-font-tertiary, #888)", margin: "3px 0 0", lineHeight: 1.4 }}>
                                    {r.reason}
                                  </p>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: "#6366f1",
                                  background: "rgba(99,102,241,0.1)", padding: "2px 7px", borderRadius: 4,
                                }}>
                                  {r.credits} cr
                                </span>
                                {r.source && (
                                  <span style={{
                                    fontSize: 9, fontWeight: 600,
                                    textTransform: "uppercase" as const, letterSpacing: "0.03em",
                                    color: "var(--admin-font-tertiary, #888)",
                                    background: "var(--admin-bg-hover, rgba(0,0,0,0.04))",
                                    padding: "2px 6px", borderRadius: 3,
                                  }}>
                                    {(r.source || "").replace("_", " ")}
                                  </span>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", padding: "24px 0" }}>
                          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary, #888)", margin: 0 }}>
                            No recommendations available
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </motion.div>
    </div>
  );
}
