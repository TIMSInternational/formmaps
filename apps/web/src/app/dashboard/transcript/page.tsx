"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  GraduationCap,
  Award,
  BookOpen,
  Hash,
  CreditCard,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
  Tooltip,
} from "recharts";
import { useTranslation } from "react-i18next";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import {
  getTranscript,
  getGpa,
  TranscriptData,
  StudentGpa,
} from "@/services/transcriptService";
import {
  countCourseRigor,
  buildGpaTrend,
} from "@/services/transcriptDerive";

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
  const { t } = useTranslation("student");
  const [data, setData] = useState<TranscriptData | null>(null);
  const [gpaRecord, setGpaRecord] = useState<StudentGpa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [transcript, gpa] = await Promise.all([
        getTranscript(),
        getGpa(),
      ]);
      setData(transcript);
      setGpaRecord(gpa);
    } catch {
      setError(true);
      toast.error(t("transcript.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byYear = data?.byYear ?? {};
  const academicYears = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
  const isEmpty = !loading && !error && academicYears.length === 0;

  // Derive sweetener values
  const rigor = countCourseRigor(byYear);
  const rigorLabel = [
    rigor.ap > 0 ? `${rigor.ap} AP` : null,
    rigor.honors > 0 ? `${rigor.honors} Honors` : null,
    rigor.ib > 0 ? `${rigor.ib} IB` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "—";

  const gpaTrend = buildGpaTrend(gpaRecord?.yearlyBreakdown);

  const rankPercentile = gpaRecord?.rankPercentile ?? null;
  const topPercent =
    rankPercentile != null
      ? `Top ${100 - Math.round(rankPercentile * 100)}%`
      : "—";

  const loadingFallback = (
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

  const emptyFallback = (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="dash-card p-12 text-center"
    >
      <div className="w-14 h-14 mx-auto mb-4 bg-secondary rounded-xl border border-border flex items-center justify-center">
        <BookOpen className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-bold text-foreground mb-1">{t("transcript.noCoursesTitle")}</h3>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">
        {t("transcript.noCoursesBody")}
      </p>
    </motion.div>
  );

  return (
    <QueryStateBoundary
      isLoading={loading}
      isError={error}
      isEmpty={isEmpty}
      onRetry={load}
      loadingFallback={loadingFallback}
      emptyFallback={emptyFallback}
    >
      <div className="space-y-8">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-6"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {t("transcript.badge")}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
              {t("transcript.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("transcript.subtitle")}
            </p>
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
          <div className="dash-card p-5" style={{ background: "var(--admin-bg-card)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("transcript.unweightedGpa")}
              </p>
            </div>
            <p
              className="text-2xl font-bold"
              style={{ color: "var(--admin-font-primary, inherit)" }}
            >
              {formatGpa(data?.gpaUnweighted)}
              <span className="text-sm text-muted-foreground font-medium ml-1">
                / 4.0
              </span>
            </p>
          </div>

          {/* Weighted GPA */}
          <div className="dash-card p-5" style={{ background: "var(--admin-bg-card)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Award className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("transcript.weightedGpa")}
              </p>
            </div>
            <p
              className="text-2xl font-bold"
              style={{ color: "var(--admin-font-primary, inherit)" }}
            >
              {formatGpa(data?.gpaWeighted)}
              <span className="text-sm text-muted-foreground font-medium ml-1">
                / 5.0
              </span>
            </p>
          </div>

          {/* Class Rank */}
          <div className="dash-card p-5" style={{ background: "var(--admin-bg-card)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <Hash className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("transcript.classRank")}
              </p>
            </div>
            <p
              className="text-2xl font-bold"
              style={{ color: "var(--admin-font-primary, inherit)" }}
            >
              {gpaRecord?.classRank != null && gpaRecord?.classSize != null
                ? `${gpaRecord.classRank} / ${gpaRecord.classSize}`
                : "—"}
            </p>
          </div>

          {/* Total Credits */}
          <div className="dash-card p-5" style={{ background: "var(--admin-bg-card)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("transcript.totalCredits")}
              </p>
            </div>
            <p
              className="text-2xl font-bold"
              style={{ color: "var(--admin-font-primary, inherit)" }}
            >
              {Number(data?.totalCredits ?? 0)}
              <span className="text-sm text-muted-foreground font-medium ml-1">
                cr
              </span>
            </p>
          </div>
        </motion.div>

        {/* Sweetener Row: Rigor Card + GPA Sparkline + Rank Percentile */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          {/* Rigor Card */}
          <div className="dash-card p-5" style={{ background: "var(--admin-bg-card)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-[#2E9098]" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("transcript.courseRigor")}
              </p>
            </div>
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--admin-font-primary, inherit)" }}
            >
              {rigorLabel}
            </p>
          </div>

          {/* GPA Trend Sparkline */}
          <div className="dash-card p-5" style={{ background: "var(--admin-bg-card)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-[#2E9098]" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("transcript.gpaTrend")}
              </p>
            </div>
            {gpaTrend.length > 1 ? (
              <ResponsiveContainer width="100%" height={48}>
                <LineChart data={gpaTrend}>
                  <YAxis domain={["auto", "auto"]} hide />
                  <Tooltip
                    formatter={(value) =>
                      typeof value === "number" ? value.toFixed(2) : "—"
                    }
                    labelFormatter={(label: string) => label}
                  />
                  <Line
                    type="monotone"
                    dataKey="gpaUnweighted"
                    stroke="#2E9098"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground">
                {gpaTrend.length === 1 ? t("transcript.moreYearsNeeded") : "—"}
              </p>
            )}
          </div>

          {/* Rank Percentile */}
          <div className="dash-card p-5" style={{ background: "var(--admin-bg-card)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("transcript.classStanding")}
              </p>
            </div>
            <p
              className="text-2xl font-bold"
              style={{ color: "var(--admin-font-primary, inherit)" }}
            >
              {topPercent}
            </p>
          </div>
        </motion.div>

        {/* Transcript Table by Year */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-6"
        >
          {academicYears.map((year, yearIdx) => {
            const rows = byYear[year];
            const yearGpa = gpaRecord?.yearlyBreakdown?.[year];

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
                        {t("transcript.table.unweighted")}{" "}
                        <span className="font-semibold text-foreground">
                          {formatGpa(yearGpa.gpaUnweighted)}
                        </span>
                      </span>
                      <span>
                        {t("transcript.table.weighted")}{" "}
                        <span className="font-semibold text-foreground">
                          {formatGpa(yearGpa.gpaWeighted)}
                        </span>
                      </span>
                      <span>
                        {t("transcript.table.creditsLabel")}{" "}
                        <span className="font-semibold text-foreground">
                          {Number(yearGpa.totalCredits)}
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
                          {t("transcript.table.courseCode")}
                        </th>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("transcript.table.grade")}
                        </th>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("transcript.table.credits")}
                        </th>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("transcript.table.level")}
                        </th>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("transcript.table.semester")}
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
                              {Number(row.credits)}
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
      </div>
    </QueryStateBoundary>
  );
}
