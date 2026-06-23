"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useMILData } from "@/hooks/useMILData";
import {
  loadMILSession,
  MILSession,
  EXAM_TYPE_TO_ID,
} from "@/services/milService";
import { formatSeconds } from "@/lib/dateUtils";
import { buildLIAReportData } from "@/components/reports/buildLIAReportData";
import dynamic from "next/dynamic";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { 
  Download, 
  Activity, 
  Brain, 
  Zap, 
  Target, 
  Clock, 
  CheckCircle2, 
  TrendingUp,
  Share2,
  Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";

const ExportReportButton = dynamic(
  () => import("@/components/reports/ExportReportButton"),
  { ssr: false, loading: () => <span className="animate-pulse">Loading...</span> }
);

// --- Styled Components Aligned with Transactions Page ---

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  blobColor: string;
  sublabel?: string;
}

const StatCard = ({ label, value, icon: Icon, color, bg, border, blobColor, sublabel }: StatCardProps) => (
  <div className={`group relative overflow-hidden rounded-2xl border ${border} bg-card p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}>
    <div
      className={`absolute right-0 top-0 h-24 w-24 translate-x-8 translate-y--8 rounded-full ${blobColor} opacity-5 blur-2xl transition-transform duration-500 group-hover:scale-150`}
    />
    
    <div className="relative flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <h3 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {value}
        </h3>
        {sublabel && <p className="mt-1 text-xs text-muted-foreground font-medium">{sublabel}</p>}
      </div>
      <div className={`rounded-xl ${bg} p-3 ${color} bg-opacity-50`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  </div>
);

interface SubtestBand {
  labelEn: string;
  color: string;
}

// Readable foreground for a band badge: dark text on light band colors (e.g. the
// yellow Adecuado #FFD600), white otherwise. Keeps WCAG contrast on every band.
function bandTextColor(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#ffffff";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}

interface SubtestResult {
  name: string;
  score: number;
  accuracy: number;
  time: string;
  fullMark: number;
  examId: string;
  band?: SubtestBand;
}

// PCA-popup-style horizontal labeled score bar: domain name on the left, a
// colored fill, and a bold % on the right. Mirrors the DISC dimension bars in
// PCAResultsPanel. Color follows the band hex when present, else falls back to
// the score-based palette used by the LIA cards (high=emerald, mid=brand blue,
// low=amber).
const ScoreBar = ({ test, index }: { test: SubtestResult; index: number }) => {
  const isHigh = test.score >= 80;
  const isMed = test.score >= 60;
  const fallbackFill = isHigh ? "#10b981" : isMed ? "#065292" : "#f59e0b";
  const fillColor = test.band?.color ?? fallbackFill;
  const labelColor = isHigh ? "text-emerald-700" : isMed ? "text-[#065292]" : "text-amber-700";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className={`font-semibold ${labelColor} break-words`}>{test.name}</span>
          {test.band && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
              style={{ backgroundColor: test.band.color, color: bandTextColor(test.band.color) }}
            >
              {test.band.labelEn}
            </span>
          )}
        </div>
        <span className="font-bold text-foreground shrink-0">{test.score}%</span>
      </div>
      <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${test.score}%` }}
          transition={{ duration: 1, delay: 0.3 + index * 0.08 }}
          className="h-2.5 rounded-full"
          style={{ backgroundColor: fillColor }}
        />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {test.time}</span>
        <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {test.accuracy}% accuracy</span>
      </div>
    </div>
  );
};

export default function MILResultsPage() {
  const { t } = useTranslation();
  const { language, user } = useGlobalStore();
  const { exams, progress, loading, getOverallScore, weightedComposite } = useMILData();
  const [sessions, setSessions] = useState<MILSession[]>([]);

  useEffect(() => {
    if (exams.length > 0) {
      const loadedSessions = exams
        .map((exam) => loadMILSession(exam.id))
        .filter((session) => session !== null) as MILSession[];
      setSessions(loadedSessions);
    }
  }, [exams]);

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary/50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-border border-t-indigo-600 rounded-full animate-spin" />
           <p className="text-muted-foreground font-medium animate-pulse">{t("dashboard.loadingResults")}</p>
        </div>
      </div>
    );
  }

  const overallScore = getOverallScore();
  const completedCount = progress?.completedExams.length || 0;
  const totalCount = exams.length || 5;

  // Calculate actual total questions from exams API data
  const totalQuestions = exams.reduce((acc, exam) => acc + exam.totalQuestions, 0);

  // Per-domain band lookup keyed by canonical exam id (from the weighted composite).
  const bandByExamId = new Map<string, { labelEn: string; color: string }>();
  for (const d of weightedComposite?.perDomain ?? []) {
    const examId = EXAM_TYPE_TO_ID[d.type];
    if (examId) bandByExamId.set(examId, { labelEn: d.labelEn, color: d.color });
  }

  // Build subtest results from real API data (enhanced exam history)
  const subtestResults = (progress?.enhancedData?.examStatus || [])
    .filter((exam) => exam.status === "completed")
    .map((exam) => ({
      name: exam.examName,
      score: Math.round(exam.scorePercentage),
      accuracy: Math.round(exam.accuracyPercentage),
      time: formatSeconds(exam.totalTimeSpent),
      fullMark: 100,
      examId: exam.examId,
      band: bandByExamId.get(exam.examId),
    }));

  // Radar Chart Data
  const radarData = subtestResults.map(t => ({
    subject: t.name,
    A: t.score,
    fullMark: 100,
  }));

  const averageAccuracy = Math.round(
    subtestResults.reduce((acc, curr) => acc + curr.accuracy, 0) / (subtestResults.length || 1)
  );

  // Build the LIA PDF payload from the student's REAL results (no dummy data).
  const liaReportData = buildLIAReportData({
    user: { id: user.id, name: user.name, email: user.email },
    overallScore,
    averageAccuracy,
    weightedComposite,
    subtests: subtestResults.map((r) => ({
      name: r.name,
      score: r.score,
      accuracy: r.accuracy,
      timeSpent: r.time,
      examId: r.examId,
    })),
  });

  return (
    <div className="min-h-screen bg-secondary/50 p-6 md:p-8 font-sans text-foreground">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold text-foreground tracking-tight">
              {t("dashboard.liaResultsTitle")}
            </h1>
            <p className="text-lg text-muted-foreground font-medium">
               {completedCount === totalCount
                ? t("dashboard.liaResultsComplete")
                : t("dashboard.liaResultsInProgress")}
            </p>
          </div>
          <div className="flex gap-3">
             <Button
              variant="outline"
              className="h-10 gap-2 rounded-xl bg-card border-border shadow-sm text-foreground hover:text-foreground"
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4" />
              {t("dashboard.printResults")}
            </Button>
            
             <ExportReportButton
                reportType="lia"
                liaData={liaReportData}
                label={t("dashboard.downloadPDFReport") || "Download Report"}
                variant="outline"
                className="h-10 gap-2 rounded-xl bg-[#065292] text-white border-transparent hover:bg-[#054a83] shadow-sm"
                size="md"
              />
          </div>
        </div>

        {/* Top Stats Row */}
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard 
                label="Overall Score"
                value={`${overallScore}%`}
                sublabel={overallScore >= 80 ? "Excellent Performance" : "Good Progress"}
                icon={Brain}
                color="text-indigo-600"
                bg="bg-indigo-50"
                border="border-indigo-100"
                blobColor="bg-indigo-500"
            />
            <StatCard
                label={t("dashboard.avgAccuracy")}
                value={`${averageAccuracy}%`}
                sublabel="Answer accuracy"
                icon={TrendingUp}
                color="text-emerald-600"
                bg="bg-emerald-50"
                border="border-emerald-100"
                blobColor="bg-emerald-500"
            />
             <StatCard 
                label={t("dashboard.totalQuestions")}
                value={totalQuestions}
                sublabel={`${completedCount}/${totalCount} Modules Done`}
                icon={CheckCircle2}
                color="text-amber-600"
                bg="bg-amber-50"
                border="border-amber-100"
                blobColor="bg-amber-500"
            />
         </div>

        {/* Weighted Composite Score (TIMS 300-point, provisional bands) */}
        {weightedComposite && (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("dashboard.compositeScore", "Composite Score")}
                </p>
                <div className="mt-2 flex items-baseline gap-3">
                  <h3 className="text-4xl font-bold tracking-tight text-foreground">
                    {weightedComposite.raw} <span className="text-2xl text-muted-foreground">/ 300</span>
                  </h3>
                  <span
                    className="rounded-full px-3 py-1 text-sm font-semibold"
                    style={{ backgroundColor: weightedComposite.color, color: bandTextColor(weightedComposite.color) }}
                  >
                    {weightedComposite.labelEn}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground italic">
                  {t(
                    "dashboard.bandsProvisionalNote",
                    "Band thresholds provisional — pending norm validation"
                  )}
                </p>
              </div>
              <div className="h-3 w-full md:w-64 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${weightedComposite.percent}%`,
                    backgroundColor: weightedComposite.color,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Personal Information — mirrors the PCA popup card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {t("dashboard.personalInformation", "Personal Information")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-sm">
            {user.name && (
              <div className="flex justify-between gap-3 min-w-0 border-b border-border/60 pb-2">
                <span className="text-muted-foreground shrink-0">{t("dashboard.name", "Name")}:</span>
                <span className="font-medium text-foreground text-right break-words min-w-0">{user.name}</span>
              </div>
            )}
            {user.id && (
              <div className="flex justify-between gap-3 min-w-0 border-b border-border/60 pb-2">
                <span className="text-muted-foreground shrink-0">{t("dashboard.id", "ID")}:</span>
                <span className="font-medium text-foreground text-right break-words min-w-0">{user.id}</span>
              </div>
            )}
            {user.email && (
              <div className="flex justify-between gap-3 min-w-0 border-b border-border/60 pb-2">
                <span className="text-muted-foreground shrink-0">{t("dashboard.email", "Email")}:</span>
                <span className="font-medium text-foreground text-right break-all min-w-0">{user.email}</span>
              </div>
            )}
            {user.role && (
              <div className="flex justify-between gap-3 min-w-0 border-b border-border/60 pb-2">
                <span className="text-muted-foreground shrink-0">{t("dashboard.role", "Role")}:</span>
                <span className="font-medium text-foreground text-right break-words min-w-0 capitalize">{user.role}</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           {/* Left: Cognitive Aptitude Scores (PCA-style bars, primary) */}
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Activity className="w-5 h-5 text-[#065292]" />
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("dashboard.cognitiveAptitudeScores", "Cognitive Aptitude Scores")}
                  </h2>
                </div>
                {subtestResults.length > 0 ? (
                  <div className="space-y-6">
                    {subtestResults.map((result, idx) => (
                      <ScoreBar key={result.name} test={result} index={idx} />
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    {t("dashboard.noResultsYet", "No completed subtests yet.")}
                  </div>
                )}
              </div>
           </div>

           {/* Right: Cognitive Profile radar (secondary) + AI insight */}
           <div className="lg:col-span-1 space-y-6">
              <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
                 <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t("dashboard.cognitiveProfile")}</h2>
                 <div className="h-[300px] flex items-center justify-center relative overflow-hidden">
                   {/* Decorative background blob for consistency */}
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-500/5 blur-3xl rounded-full pointer-events-none" />

                   <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#f3f4f6" strokeDasharray="3 3" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 500 }} />
                      <Radar
                        name="Score"
                        dataKey="A"
                        stroke="#065292"
                        strokeWidth={3}
                        fill="#065292"
                        fillOpacity={0.2}
                      />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                        itemStyle={{ color: '#065292', fontWeight: 600 }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                 </div>
              </div>

              {subtestResults.length > 0 && (
              <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100">
                  <div className="flex gap-3">
                      <Zap className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                      <div>
                          <h4 className="font-bold text-indigo-900 text-sm mb-1">{t("dashboard.aiInsight", "AI Insight")}</h4>
                          <p className="text-sm text-indigo-700 leading-relaxed">
                              {(() => {
                                const best = subtestResults.reduce((a, b) => a.score > b.score ? a : b, subtestResults[0]);
                                return t("dashboard.aiInsightMIL", {
                                  defaultValue: `Your strongest area is {{area}} ({{score}}%). This suggests strong aptitude for careers requiring this cognitive skill.`,
                                  area: best.name,
                                  score: best.score,
                                });
                              })()}
                          </p>
                      </div>
                  </div>
              </div>
              )}
           </div>
        </div>

      </div>
    </div>
  );
}
