"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  GraduationCap,
  RefreshCw,
  Award,
  BookOpen,
  Hash,
  CreditCard,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  getTranscript,
  computeGpa,
  TranscriptData,
  StudentGpa,
} from "@/services/transcriptService";

const levelColors: Record<string, { bg: string; text: string }> = {
  AP: { bg: "bg-indigo-100", text: "text-indigo-700" },
  IB: { bg: "bg-purple-100", text: "text-purple-700" },
  honors: { bg: "bg-amber-100", text: "text-amber-700" },
  regular: { bg: "bg-secondary", text: "text-muted-foreground" },
};

function getLevelStyle(level: string | null) {
  if (!level) return levelColors.regular;
  const key = Object.keys(levelColors).find(
    (k) => k.toLowerCase() === level.toLowerCase()
  );
  return levelColors[key ?? "regular"] ?? levelColors.regular;
}

function formatGpa(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toFixed(2);
}

export default function TranscriptPage() {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const result = await getTranscript();
        setData(result);
      } catch {
        toast.error("Failed to load transcript.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleRecompute() {
    setRecomputing(true);
    try {
      const updated: StudentGpa = await computeGpa();
      setData((prev) =>
        prev ? { ...prev, gpa: updated } : { grades: {}, gpa: updated }
      );
      toast.success("GPA recomputed successfully.");
    } catch {
      toast.error("Failed to recompute GPA.");
    } finally {
      setRecomputing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const gpa = data?.gpa ?? null;
  const grades = data?.grades ?? {};
  const academicYears = Object.keys(grades).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Academic Record
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
            My Transcript
          </h1>
          <p className="text-sm text-muted-foreground">
            A full view of your academic history, GPA, and credit progress.
          </p>
        </div>

        <div className="flex-shrink-0">
          <Button
            onClick={handleRecompute}
            disabled={recomputing}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${recomputing ? "animate-spin" : ""}`}
            />
            Recompute GPA
          </Button>
        </div>
      </motion.div>

      {/* GPA Summary Cards */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {/* Unweighted GPA */}
        <div
          className="dash-card p-5"
          style={{ background: "var(--admin-bg-card)" }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Unweighted GPA
            </p>
          </div>
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--admin-font-primary, inherit)" }}
          >
            {formatGpa(gpa?.gpaUnweighted)}
            <span className="text-sm text-muted-foreground font-medium ml-1">
              / 4.0
            </span>
          </p>
        </div>

        {/* Weighted GPA */}
        <div
          className="dash-card p-5"
          style={{ background: "var(--admin-bg-card)" }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Award className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Weighted GPA
            </p>
          </div>
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--admin-font-primary, inherit)" }}
          >
            {formatGpa(gpa?.gpaWeighted)}
            <span className="text-sm text-muted-foreground font-medium ml-1">
              / 5.0
            </span>
          </p>
        </div>

        {/* Class Rank */}
        <div
          className="dash-card p-5"
          style={{ background: "var(--admin-bg-card)" }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Hash className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Class Rank
            </p>
          </div>
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--admin-font-primary, inherit)" }}
          >
            {gpa?.classRank != null && gpa?.classSize != null
              ? `${gpa.classRank} / ${gpa.classSize}`
              : "—"}
          </p>
        </div>

        {/* Total Credits */}
        <div
          className="dash-card p-5"
          style={{ background: "var(--admin-bg-card)" }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Total Credits
            </p>
          </div>
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--admin-font-primary, inherit)" }}
          >
            {gpa?.totalCredits ?? 0}
            <span className="text-sm text-muted-foreground font-medium ml-1">
              cr
            </span>
          </p>
        </div>
      </motion.div>

      {/* Transcript Table */}
      {academicYears.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="dash-card p-12 text-center"
        >
          <div className="w-14 h-14 mx-auto mb-4 bg-secondary rounded-xl border border-border flex items-center justify-center">
            <BookOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-bold text-foreground mb-1">
            No Courses Yet
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Your transcript will populate once course grades have been entered
            by your school.
          </p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-6"
        >
          {academicYears.map((year, yearIdx) => {
            const rows = grades[year];
            const yearGpa = gpa?.yearlyBreakdown?.[year];

            return (
              <motion.div
                key={year}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + yearIdx * 0.05 }}
                className="dash-card overflow-hidden"
                style={{ background: "var(--admin-bg-card)" }}
              >
                {/* Year Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-secondary">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      {year}
                    </span>
                  </div>
                  {yearGpa && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        Unweighted:{" "}
                        <span className="font-semibold text-foreground">
                          {formatGpa(yearGpa.unweighted)}
                        </span>
                      </span>
                      <span>
                        Weighted:{" "}
                        <span className="font-semibold text-foreground">
                          {formatGpa(yearGpa.weighted)}
                        </span>
                      </span>
                      <span>
                        Credits:{" "}
                        <span className="font-semibold text-foreground">
                          {yearGpa.credits}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Course Code
                        </th>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Grade
                        </th>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Credits
                        </th>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Level
                        </th>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Semester
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rowIdx) => {
                        const levelStyle = getLevelStyle(row.courseLevel);
                        return (
                          <tr
                            key={row.id}
                            className={`border-b border-border last:border-0 transition-colors ${
                              rowIdx % 2 === 0
                                ? "bg-transparent"
                                : "bg-secondary/40"
                            }`}
                          >
                            <td className="px-5 py-3 font-mono text-xs font-medium text-foreground">
                              {row.courseCode ?? (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold">
                                {row.grade ?? "—"}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-xs text-foreground">
                              {row.credits}
                            </td>
                            <td className="px-5 py-3">
                              {row.courseLevel ? (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${levelStyle.bg} ${levelStyle.text}`}
                                >
                                  {row.courseLevel}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-xs text-muted-foreground">
                              {row.semester ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
