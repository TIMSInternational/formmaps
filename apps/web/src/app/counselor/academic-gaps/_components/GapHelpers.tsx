"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";

export function GapSkeleton({ width, height, radius = 10 }: { width?: string | number; height: number; radius?: number }) {
  return (
    <div style={{
      width: width ?? "100%", height, borderRadius: radius,
      background: "var(--admin-bg-hover, rgba(0,0,0,0.05))",
      animation: "pulse 1.5s ease-in-out infinite",
    }} />
  );
}

export function MiniBar({ earned, required, color = "#065292", height = 4 }: {
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

interface CourseRecommendation {
  courseName: string;
  courseCode: string;
  credits: number;
  category?: string;
}

export function GapCategoryCard({ gap, recommendations, index }: {
  gap: { category: string; creditsEarned: number; creditsRequired: number; deficit: number };
  recommendations: CourseRecommendation[];
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const matching = recommendations.filter(
    (r) => (r.category || "").toLowerCase() === (gap.category || "").toLowerCase()
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
      <div style={{ display: "flex" }}>
        <div style={{ width: 4, background: "#ef4444", flexShrink: 0 }} />
        <div style={{ flex: 1, padding: "14px 16px" }}>
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

          <MiniBar earned={gap.creditsEarned} required={gap.creditsRequired} color="#ef4444" height={6} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary, #888)" }}>
              Earned: {gap.creditsEarned}
            </span>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary, #888)" }}>
              Required: {gap.creditsRequired}
            </span>
          </div>

          {matching.length > 0 && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  marginTop: 10, display: "flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: 600, color: "#065292",
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
                      {matching.map((r, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 10px", borderRadius: 6,
                          background: "var(--admin-bg-hover, rgba(0,0,0,0.03))",
                          border: "1px solid var(--admin-border-default, rgba(0,0,0,0.06))",
                        }}>
                          <BookOpen style={{ width: 13, height: 13, color: "#065292", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary, #111)" }}>
                              {r.courseName}
                            </span>
                            <span style={{ fontSize: 10, color: "var(--admin-font-tertiary, #888)", marginLeft: 6, fontFamily: "monospace" }}>
                              {r.courseCode}
                            </span>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: "#065292",
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
