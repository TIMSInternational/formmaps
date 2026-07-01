"use client";

import { motion, AnimatePresence } from "motion/react";
import {
  TrendingDown, BookOpen, AlertCircle, Target,
  CheckCircle2, Briefcase,
} from "lucide-react";
import { MiniBar, GapSkeleton, GapCategoryCard } from "./GapHelpers";

interface GapData {
  studentName?: string;
  gradeLevel?: number;
  creditsEarned?: number;
  creditsRequired?: number;
  creditGaps?: { category: string; creditsEarned: number; creditsRequired: number; deficit: number }[];
  courseGaps?: { courseName: string; courseCode: string }[];
  careerGaps?: { careerPath: string; missingSkills: string[] }[];
}

interface CourseRecommendation {
  courseName: string;
  courseCode: string;
  credits: number;
  category?: string;
  reason?: string;
  source?: string;
}

export function StudentDetailView({
  selectedStudentId,
  gaps,
  gapsLoading,
  allRecs,
  recsLoading,
}: {
  selectedStudentId: string;
  gaps: GapData | undefined;
  gapsLoading: boolean;
  allRecs: CourseRecommendation[];
  recsLoading: boolean;
}) {
  return (
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
            {/* Credit Summary Card */}
            {gapsLoading ? (
              <GapSkeleton height={110} />
            ) : gaps ? (
              <CreditSummaryCard gaps={gaps} />
            ) : null}

            {/* Gap Categories */}
            {gapsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <GapSkeleton height={90} />
                <GapSkeleton height={90} />
              </div>
            ) : gaps ? (
              <GapCategories gaps={gaps} allRecs={allRecs} />
            ) : (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <AlertCircle style={{ width: 28, height: 28, color: "var(--admin-font-tertiary, #888)", margin: "0 auto 8px", opacity: 0.4 }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-tertiary, #888)", margin: 0 }}>
                  Unable to load gap data.
                </p>
              </div>
            )}

            {/* Recommended Courses */}
            {selectedStudentId && (
              <RecommendedCoursesCard allRecs={allRecs} recsLoading={recsLoading} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CreditSummaryCard({ gaps }: { gaps: GapData }) {
  return (
    <div style={{
      background: "var(--admin-bg-card, #fff)",
      border: "1px solid var(--admin-border-default, rgba(0,0,0,0.08))",
      borderRadius: 12, padding: "20px 24px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary, #111)", margin: 0 }}>
            {gaps.studentName || "Student"}
          </h2>
          {gaps.gradeLevel && (
            <p style={{ fontSize: 11, color: "var(--admin-font-tertiary, #888)", margin: "2px 0 0" }}>
              Grade {gaps.gradeLevel}
            </p>
          )}
        </div>
        {(gaps.creditsRequired ?? 0) > 0 && (
          <div style={{ textAlign: "right" as const }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: "var(--admin-font-primary, #111)" }}>
              {Math.round(((gaps.creditsEarned ?? 0) / (gaps.creditsRequired ?? 1)) * 100)}%
            </span>
            <p style={{ fontSize: 11, color: "var(--admin-font-tertiary, #888)", margin: "2px 0 0" }}>
              {gaps.creditsEarned} / {gaps.creditsRequired} credits
            </p>
          </div>
        )}
      </div>
      {(gaps.creditsRequired ?? 0) > 0 && (
        <MiniBar earned={gaps.creditsEarned ?? 0} required={gaps.creditsRequired ?? 1} color="#2E9098" height={8} />
      )}
      {((gaps.creditsRequired ?? 0) - (gaps.creditsEarned ?? 0)) > 0 && (
        <p style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", margin: "6px 0 0" }}>
          {(gaps.creditsRequired ?? 0) - (gaps.creditsEarned ?? 0)} credits remaining to graduate
        </p>
      )}
    </div>
  );
}

function GapCategories({ gaps, allRecs }: { gaps: GapData; allRecs: CourseRecommendation[] }) {
  return (
    <>
      {/* Credit gaps */}
      {(gaps.creditGaps?.length ?? 0) > 0 && (
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
              {gaps.creditGaps!.length} categories
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {gaps.creditGaps!.map((g, i) => (
              <GapCategoryCard key={i} gap={g} recommendations={allRecs} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Course gaps */}
      {(gaps.courseGaps?.length ?? 0) > 0 && (
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
            {gaps.courseGaps!.map((g, i) => (
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
      {(gaps.careerGaps?.length ?? 0) > 0 && (
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
            {gaps.careerGaps!.map((g, i) => (
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
  );
}

function RecommendedCoursesCard({ allRecs, recsLoading }: { allRecs: CourseRecommendation[]; recsLoading: boolean }) {
  return (
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
            <GapSkeleton height={56} />
            <GapSkeleton height={56} />
            <GapSkeleton height={56} />
          </div>
        ) : allRecs.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allRecs.map((r, i) => (
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
                    fontSize: 10, fontWeight: 700, color: "#2E9098",
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
  );
}
