"use client";

// School-Admin view of Academic Gap Analysis — shows ALL school students (counselor view shows only assigned).
// Re-uses the same hooks from useAcademicGapQueries.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Search, TrendingDown, BookOpen, Lightbulb, AlertTriangle, Target, BarChart3, ChevronRight, GraduationCap, MapPin, Share2, Sparkles, Filter, CheckCircle } from "lucide-react";
import {
  useAcademicGapSummary,
  useStudentAcademicGaps,
  useStudentCourseRecommendations,
} from "@/hooks/useAcademicGapQueries";
import type { AcademicGapSummaryItem } from "@/types/academicGap";

export default function SchoolAdminAcademicGapsPage() {
  const { t } = useTranslation();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useAcademicGapSummary({ limit: 100 });
  const { data: gaps, isLoading: gapsLoading } = useStudentAcademicGaps(selectedStudentId);
  const { data: recs, isLoading: recsLoading } = useStudentCourseRecommendations(selectedStudentId);

  const filteredStudents = (summary?.data ?? []).filter((s: AcademicGapSummaryItem) =>
    !search || s.studentName?.toLowerCase().includes(search.toLowerCase())
  );

  const priorityBadge = (level: string) => {
    if (level === "behind") return { bg: "rgba(239,68,68,0.1)", color: "#ef4444" };
    if (level === "at_risk") return { bg: "rgba(245,158,11,0.1)", color: "#f59e0b" };
    return { bg: "rgba(16,185,129,0.1)", color: "#10b981" };
  };

  const getInitials = (name: string) => {
    if (!name) return "ST";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const selectedStudent = summary?.data?.find((s: AcademicGapSummaryItem) => s.studentId === selectedStudentId);

  if (summaryLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" style={{ background: "var(--admin-bg-hover)" }} />)}
        </div>
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  // Handle API error / no data gracefully
  const hasData = !summaryError && summary?.data && summary.data.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          {t("schoolAdmin.gaps.title", "Academic Gap Analysis")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          {t("schoolAdmin.gaps.subtitle", "School-wide view of academic trajectories, credit deficits, and AI-powered intervention recommendations.")}
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Monitored", value: summary.summary?.totalStudents ?? 0, icon: BarChart3, color: "#3b82f6" },
            { label: "Behind Track", value: summary.summary?.behind ?? 0, icon: AlertTriangle, color: "#ef4444" },
            { label: "At Risk", value: summary.summary?.atRisk ?? 0, icon: Target, color: "#f59e0b" },
            { label: "On Track", value: summary.summary?.onTrack ?? 0, icon: BookOpen, color: "#10b981" },
          ].map((stat) => (
            <div key={stat.label} style={{
              borderRadius: 8, border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)", padding: "16px",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${stat.color}15`,
                display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10,
              }}>
                <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", borderRadius: 8, padding: 2 }} className="inline-flex mb-4">
          <TabsTrigger value="overview" style={{ borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
            Master Roster
          </TabsTrigger>
          <TabsTrigger value="detail" disabled={!selectedStudentId} style={{ borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
            {selectedStudent ? `${selectedStudent.studentName.split(' ')[0]}'s Profile` : 'Student Profile'}
          </TabsTrigger>
        </TabsList>

        {tab === "overview" && (
          <TabsContent value="overview">
            <div style={{
              borderRadius: 8, border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)", overflow: "hidden",
            }}>
              {/* Header with search */}
              <div style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--admin-border-default)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                background: "var(--admin-bg-hover)",
                flexWrap: "wrap",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <GraduationCap style={{ width: 16, height: 16, color: "var(--admin-accent-blue, #3b82f6)" }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Student Trajectories</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Identify students needing intervention across the entire institution.</div>
                  </div>
                </div>
                <div className="relative" style={{ width: 260 }}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                  <Input
                    placeholder="Search students..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-8 text-xs"
                    style={{ borderRadius: 6, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
                  />
                </div>
              </div>

              {/* Student List */}
              <div>
                {filteredStudents.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 16px" }}>
                    <TrendingDown style={{ width: 32, height: 32, color: "var(--admin-font-tertiary)", margin: "0 auto 12px", opacity: 0.4 }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>No Students Found</div>
                    <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", maxWidth: 300, margin: "0 auto" }}>
                      {search ? "Try adjusting your search criteria." : "There is no academic trajectory data available yet."}
                    </div>
                  </div>
                ) : (
                  filteredStudents.map((s: AcademicGapSummaryItem) => {
                    const badge = priorityBadge(s.overallStatus);
                    return (
                      <div
                        key={s.studentId}
                        onClick={() => { setSelectedStudentId(s.studentId); setTab("detail"); }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                          padding: "12px 16px", cursor: "pointer",
                          borderBottom: "1px solid var(--admin-border-default)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: "var(--admin-bg-hover)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 600, color: "var(--admin-font-primary)", flexShrink: 0,
                          }}>
                            {getInitials(s.studentName)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.studentName}</span>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                                background: badge.bg, color: badge.color, textTransform: "capitalize",
                              }}>
                                {s.overallStatus?.replace("_", " ")}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                              <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center", gap: 3 }}>
                                <AlertTriangle style={{ width: 11, height: 11, color: "#ef4444" }} /> {s.missingRequiredCourses} required missing
                              </span>
                              <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center", gap: 3 }}>
                                <MapPin style={{ width: 11, height: 11, color: "#f59e0b" }} /> {s.creditDeficit} credit deficit
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                          <div className="hidden md:block" style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Primary Gap</div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.topGap || "None detected"}</div>
                          </div>
                          <button style={{
                            height: 30, borderRadius: 6, padding: "0 10px",
                            fontSize: 11, fontWeight: 600,
                            display: "flex", alignItems: "center", gap: 4,
                            background: "transparent",
                            color: "var(--admin-accent-blue, #3b82f6)",
                            border: "1px solid var(--admin-border-default)",
                            cursor: "pointer",
                          }}>
                            Examine <ChevronRight style={{ width: 12, height: 12 }} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </TabsContent>
        )}

        {tab === "detail" && (
          <TabsContent value="detail" className="space-y-4">
            {/* Header Strip */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "12px 16px", borderRadius: 8,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)",
              flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => { setTab("overview"); setSelectedStudentId(""); }}
                  style={{
                    width: 32, height: 32, borderRadius: 6,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
                    cursor: "pointer", color: "var(--admin-font-tertiary)",
                  }}
                >
                  <ChevronRight style={{ width: 16, height: 16, transform: "rotate(180deg)" }} />
                </button>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                    {selectedStudent?.studentName}
                  </div>
                  {selectedStudent && (
                    <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 1 }}>
                      Currently marked as <span style={{ fontWeight: 600, color: "var(--admin-font-primary)", textTransform: "capitalize" }}>{selectedStudent.overallStatus?.replace("_", " ")}</span>
                    </div>
                  )}
                </div>
              </div>
              <button style={{
                height: 32, borderRadius: 6, padding: "0 12px",
                fontSize: 11, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 4,
                background: "transparent",
                color: "var(--admin-font-primary)",
                border: "1px solid var(--admin-border-default)",
                cursor: "pointer",
              }}>
                <Share2 style={{ width: 12, height: 12 }} /> Share Report
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Gaps Column */}
              <div style={{
                borderRadius: 8, border: "1px solid var(--admin-border-default)",
                background: "var(--admin-bg-card)", overflow: "hidden", display: "flex", flexDirection: "column",
              }}>
                <div style={{
                  padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
                  display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)",
                }}>
                  <TrendingDown style={{ width: 14, height: 14, color: "#ef4444" }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Identified Academic Gaps</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Credit deficiencies and missing core requirements.</div>
                  </div>
                </div>
                <div style={{ padding: 16, flex: 1 }}>
                  {gapsLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full" style={{ background: "var(--admin-bg-hover)" }} />
                      <Skeleton className="h-20 w-full" style={{ background: "var(--admin-bg-hover)" }} />
                    </div>
                  ) : gaps?.creditGaps?.length ? (
                    <div className="space-y-3">
                      {gaps.creditGaps.map((g: any, i: number) => (
                        <div key={i} style={{
                          padding: "12px 14px", borderRadius: 6,
                          border: "1px solid var(--admin-border-default)",
                          background: "var(--admin-bg-card)",
                          borderLeft: "3px solid #ef4444",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{g.category}</span>
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                              background: "rgba(239,68,68,0.1)", color: "#ef4444",
                            }}>
                              -{g.deficit} credits
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", padding: "6px 8px", borderRadius: 4, background: "var(--admin-bg-hover)" }}>
                            <span style={{ fontWeight: 600, color: "#ef4444", marginRight: 4 }}>Fix:</span>
                            {g.recommendation}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "40px 16px" }}>
                      <BookOpen style={{ width: 28, height: 28, color: "#10b981", margin: "0 auto 10px", opacity: 0.5 }} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>No Deficiencies</div>
                      <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 4, maxWidth: 220, margin: "4px auto 0" }}>This student is completely on track.</div>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Recommendations Column */}
              <div style={{
                borderRadius: 8, border: "1px solid var(--admin-border-default)",
                background: "var(--admin-bg-card)", overflow: "hidden", display: "flex", flexDirection: "column",
              }}>
                <div style={{
                  padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
                  display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)",
                }}>
                  <Lightbulb style={{ width: 14, height: 14, color: "#f59e0b" }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>AI Recommendations</div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Intelligent course targeting to repair trajectories.</div>
                  </div>
                </div>
                <div style={{ padding: 16, flex: 1 }}>
                  {recsLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full" style={{ background: "var(--admin-bg-hover)" }} />
                      <Skeleton className="h-20 w-full" style={{ background: "var(--admin-bg-hover)" }} />
                    </div>
                  ) : recs?.nextSemester?.length || recs?.longTerm?.length ? (
                    <div className="space-y-3">
                      {[...(recs.nextSemester ?? []), ...(recs.longTerm ?? [])].map((r: any, i: number) => (
                        <div key={i} style={{
                          padding: "12px 14px", borderRadius: 6,
                          border: "1px solid var(--admin-border-default)",
                          background: "var(--admin-bg-card)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Sparkles style={{ width: 12, height: 12, color: "#f59e0b" }} />
                              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{r.courseName}</span>
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                              background: "rgba(245,158,11,0.1)", color: "#f59e0b",
                            }}>
                              Recommend
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", paddingLeft: 20, borderLeft: "2px solid var(--admin-border-default)", marginLeft: 6 }}>
                            {r.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "40px 16px" }}>
                      <CheckCircle style={{ width: 28, height: 28, color: "var(--admin-font-tertiary)", margin: "0 auto 10px", opacity: 0.4 }} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>No Recs Needed</div>
                      <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 4, maxWidth: 220, margin: "4px auto 0" }}>No specific remedial interventions are prescribed at this time.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
