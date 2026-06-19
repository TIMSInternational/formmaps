"use client";

import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { Users, AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  useAcademicGapSummary,
  useStudentAcademicGaps,
  useStudentCourseRecommendations,
} from "@/hooks/useAcademicGapQueries";
import type { AcademicGapSummaryItem } from "@/types/academicGap";
import { StatCard } from "./_components/StatCard";
import { GapSkeleton } from "./_components/GapHelpers";
import { StudentList } from "./_components/StudentList";
import { StudentDetailView } from "./_components/StudentDetailView";

const severityOrder: Record<string, number> = { off_track: 0, at_risk: 1, on_track: 2 };

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

  // Loading state
  if (summaryLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[1, 2, 3, 4].map(i => <GapSkeleton key={i} height={80} />)}
        </div>
        <GapSkeleton height={500} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary Stat Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatCard label="Total Students" value={summary.summary?.totalStudents ?? 0} color="#065292" icon={Users} delay={0.05} />
          <StatCard label="Off Track" value={summary.summary?.offTrack ?? 0} color="#ef4444" icon={AlertCircle} delay={0.1} />
          <StatCard label="At Risk" value={summary.summary?.atRisk ?? 0} color="#f59e0b" icon={AlertTriangle} delay={0.15} />
          <StatCard label="On Track" value={summary.summary?.onTrack ?? 0} color="#10b981" icon={CheckCircle2} delay={0.2} />
        </div>
      )}

      {/* Split Panel */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" }}
      >
        <StudentList
          students={sortedStudents}
          selectedStudentId={selectedStudentId}
          onSelectStudent={setSelectedStudentId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          totalStudents={summary?.summary?.totalStudents ?? 24}
        />

        <StudentDetailView
          selectedStudentId={selectedStudentId}
          gaps={gaps}
          gapsLoading={gapsLoading}
          allRecs={allRecs}
          recsLoading={recsLoading}
        />
      </motion.div>
    </div>
  );
}
