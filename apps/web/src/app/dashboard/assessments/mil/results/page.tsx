"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useMILData } from "@/hooks/useMILData";
import { loadMILSession, MILSession } from "@/services/milService";
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

const StatCard = ({ label, value, icon: Icon, color, bg, border, blobColor, sublabel }: any) => (
  <div className={`group relative overflow-hidden rounded-2xl border ${border} bg-white p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}>
    <div
      className={`absolute right-0 top-0 h-24 w-24 translate-x-8 translate-y--8 rounded-full ${blobColor} opacity-5 blur-2xl transition-transform duration-500 group-hover:scale-150`}
    />
    
    <div className="relative flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <h3 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
          {value}
        </h3>
        {sublabel && <p className="mt-1 text-xs text-gray-400 font-medium">{sublabel}</p>}
      </div>
      <div className={`rounded-xl ${bg} p-3 ${color} bg-opacity-50`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  </div>
);

const SubtestCard = ({ test, index }: { test: any; index: number }) => {
  // Determine colors based on score
  const isHigh = test.score >= 80;
  const isMed = test.score >= 60;
  
  const color = isHigh ? "text-emerald-600" : isMed ? "text-blue-600" : "text-amber-600";
  const bg = isHigh ? "bg-emerald-50" : isMed ? "bg-blue-50" : "bg-amber-50";
  const border = isHigh ? "border-emerald-100" : isMed ? "border-blue-100" : "border-amber-100";
  const barColor = isHigh ? "bg-emerald-500" : isMed ? "bg-blue-500" : "bg-amber-500";
  const blob = isHigh ? "bg-emerald-500" : isMed ? "bg-blue-500" : "bg-amber-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`group relative overflow-hidden rounded-2xl border ${border} bg-white p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
    >
      <div
        className={`absolute right-0 top-0 h-32 w-32 translate-x-10 translate-y--10 rounded-full ${blob} opacity-5 blur-3xl transition-transform duration-500 group-hover:scale-150`}
      />

      <div className="relative">
        <div className="flex justify-between items-start mb-4">
          <div>
             <h4 className="font-bold text-gray-900 text-lg group-hover:text-indigo-600 transition-colors">{test.name}</h4>
             <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {test.time}</span>
                <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" /> {test.percentile}th %tile</span>
             </div>
          </div>
          <div className={`rounded-xl ${bg} p-2 ${color}`}>
            <span className="text-lg font-bold">{test.score}%</span>
          </div>
        </div>

        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${test.score}%` }}
            transition={{ duration: 1, delay: 0.5 }}
            className={`h-full ${barColor} rounded-full`}
          />
        </div>
      </div>
    </motion.div>
  );
};

export default function MILResultsPage() {
  const { t } = useTranslation();
  const { language } = useGlobalStore();
  const { exams, progress, loading, getOverallScore } = useMILData();
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
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
           <p className="text-gray-500 font-medium animate-pulse">{t("dashboard.loadingResults")}</p>
        </div>
      </div>
    );
  }

  const overallScore = getOverallScore();
  const completedCount = progress?.completedExams.length || 0;
  const totalCount = exams.length || 5;

  // Calculate actual total questions from exams API data
  const totalQuestions = exams.reduce((acc, exam) => acc + exam.totalQuestions, 0);

  // Mock detailed results
  const subtestResults = [
    {
      name: language === "spanish" ? "Reconocimiento de Patrones" : "Pattern Recognition",
      score: 85,
      percentile: 78,
      time: "2:45",
      fullMark: 100,
    },
    {
      name: language === "spanish" ? "Razonamiento Verbal" : "Verbal Reasoning",
      score: 78,
      percentile: 65,
      time: "3:12",
      fullMark: 100,
    },
    {
      name: language === "spanish" ? "Memoria de Trabajo" : "Working Memory",
      score: 72,
      percentile: 58,
      time: "2:58", fullMark: 100,
    },
    {
      name: language === "spanish" ? "Velocidad Numérica" : "Numeric Velocity",
      score: 68,
      percentile: 52,
      time: "2:33", fullMark: 100,
    },
    {
      name: language === "spanish" ? "Rotación Visual" : "Visual Rotation",
      score: 75,
      percentile: 61,
      time: "3:05", fullMark: 100,
    },
  ].slice(0, completedCount > 0 ? completedCount : 5); 

  // Radar Chart Data
  const radarData = subtestResults.map(t => ({
    subject: t.name,
    A: t.score,
    fullMark: 100,
  }));

  const averagePercentile = Math.round(
    subtestResults.reduce((acc, curr) => acc + curr.percentile, 0) / (subtestResults.length || 1)
  );

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
              {t("dashboard.liaResultsTitle")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
               {completedCount === totalCount
                ? t("dashboard.liaResultsComplete")
                : t("dashboard.liaResultsInProgress")}
            </p>
          </div>
          <div className="flex gap-3">
             <Button
              variant="outline"
              className="h-10 gap-2 rounded-xl bg-white border-gray-200 shadow-sm text-gray-700 hover:text-gray-900"
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4" />
              {t("dashboard.printResults")}
            </Button>
            
             <ExportReportButton
                reportType="lia"
                label={t("dashboard.downloadPDFReport") || "Download Report"}
                variant="outline"
                className="h-10 gap-2 rounded-xl bg-indigo-600 text-white border-transparent hover:bg-indigo-700 shadow-sm shadow-indigo-200"
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
                label={t("dashboard.avgPercentile")}
                value={`${averagePercentile}%`}
                sublabel="Better than average"
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

        {/* Main Content Split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           {/* Left: Detailed Results (2 cols) */}
           <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">{t("dashboard.subtestPerformance")}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {subtestResults.map((result, idx) => (
                    <SubtestCard key={result.name} test={result} index={idx} />
                  ))}
              </div>
           </div>

           {/* Right: Cognitive Profile (1 col) */}
           <div className="lg:col-span-1 space-y-6">
              <h2 className="text-xl font-bold text-gray-900">{t("dashboard.cognitiveProfile")}</h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-[400px] flex flex-col items-center justify-center relative overflow-hidden">
                 {/* Decorative background blob for consistency */}
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-500/5 blur-3xl rounded-full pointer-events-none" />
                 
                 <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="#f3f4f6" strokeDasharray="3 3" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 500 }} />
                    <Radar
                      name="Score"
                      dataKey="A"
                      stroke="#6366f1"
                      strokeWidth={3}
                      fill="#6366f1"
                      fillOpacity={0.2}
                    />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                      itemStyle={{ color: '#4f46e5', fontWeight: 600 }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              
              <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100">
                  <div className="flex gap-3">
                      <Zap className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                      <div>
                          <h4 className="font-bold text-indigo-900 text-sm mb-1">AI Insight</h4>
                          <p className="text-sm text-indigo-700 leading-relaxed">
                              Your pattern recognition score is exceptional. Consider roles in Data Science or Strategic Planning.
                          </p>
                      </div>
                  </div>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
