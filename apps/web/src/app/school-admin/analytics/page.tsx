"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  BarChart3,
  Award,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalyticsOverview, usePerformanceTrends, useTopPerformers } from "@/hooks/useSchoolAdmin";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">("month");
  const [metric, setMetric] = useState<"score" | "completion" | "time">("score");

  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview(period);
  const { data: trends } = usePerformanceTrends(period, metric);
  const { data: topPerformers } = useTopPerformers(5);

  const statCards = overview ? [
    {
      title: t("schoolAdmin.analytics.engagement.title", "Student Engagement"),
      value: overview.studentEngagement.active,
      subtitle: `${overview.studentEngagement.inactive} ${t("schoolAdmin.analytics.engagement.inactive", "inactive")}`,
      trend: overview.studentEngagement.trend,
      icon: Users,
      color: "text-teal-600",
      bg: "bg-teal-50",
    },
    {
      title: t("schoolAdmin.analytics.completion.rate", "Completion Rate"),
      value: `${overview.assessmentCompletion.completionRate.toFixed(1)}%`,
      subtitle: `${overview.assessmentCompletion.completed} ${t("schoolAdmin.analytics.completion.completed", "completed")}`,
      trend: 0,
      icon: Target,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: t("schoolAdmin.analytics.performance.score", "Average Score"),
      value: `${overview.averagePerformance.score.toFixed(1)}%`,
      subtitle: t("schoolAdmin.analytics.allAssessments", "Across all assessments"),
      trend: overview.averagePerformance.trend,
      icon: BarChart3,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      title: t("schoolAdmin.analytics.timeSpent.average", "Avg. Time Spent"),
      value: `${overview.timeSpent.averageHours.toFixed(1)}h`,
      subtitle: `${overview.timeSpent.totalHours} ${t("schoolAdmin.analytics.timeSpent.total", "total hours")}`,
      trend: overview.timeSpent.trend,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ] : [];

  return (
    <div className="space-y-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
        >
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              {t("schoolAdmin.analytics.title", "Analytics")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              {t("schoolAdmin.analytics.subtitle", "Track student performance and engagement trends.")}
            </p>
          </div>

          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-48 bg-white">
              <SelectValue placeholder={t("common.selectPeriod", "Select period")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">{t("schoolAdmin.analytics.period.week", "This Week")}</SelectItem>
              <SelectItem value="month">{t("schoolAdmin.analytics.period.month", "This Month")}</SelectItem>
              <SelectItem value="quarter">{t("schoolAdmin.analytics.period.quarter", "This Quarter")}</SelectItem>
              <SelectItem value="year">{t("schoolAdmin.analytics.period.year", "This Year")}</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {overviewLoading ? (
            [...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl border border-gray-100" />
            ))
          ) : (
            statCards.map((stat, index) => (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
                className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", stat.bg)}>
                    <stat.icon className={cn("w-6 h-6", stat.color)} />
                  </div>
                  {stat.trend !== 0 && (
                    <div className={cn(
                      "flex items-center text-xs font-medium px-2 py-1 rounded-full",
                      stat.trend > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                    )}>
                      {stat.trend > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                      {Math.abs(stat.trend).toFixed(1)}%
                    </div>
                  )}
                </div>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.title}</p>
                <p className="text-xs text-gray-400 mt-1">{stat.subtitle}</p>
              </motion.div>
            ))
          )}
        </motion.div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Performance Trend Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">{t("schoolAdmin.analytics.trends.title", "Performance Trends")}</h3>
              <Select value={metric} onValueChange={(v: any) => setMetric(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("common.selectMetric", "Select metric")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">{t("schoolAdmin.analytics.trends.metric.score", "Score")}</SelectItem>
                  <SelectItem value="completion">{t("schoolAdmin.analytics.trends.metric.completion", "Completion")}</SelectItem>
                  <SelectItem value="time">{t("schoolAdmin.analytics.trends.metric.time", "Time Spent")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Simple Chart Visualization */}
            <div className="h-64 flex items-end justify-around gap-4 px-4">
              {trends?.labels.map((label, index) => {
                const value = trends.datasets[0]?.data[index] || 0;
                const maxValue = Math.max(...(trends.datasets[0]?.data || [1]));
                const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
                return (
                  <div key={label} className="flex flex-col items-center gap-2 flex-1">
                    <div className="w-full bg-gray-100 rounded-t-lg relative" style={{ height: '200px' }}>
                      <div
                        className="absolute bottom-0 w-full bg-gradient-to-t from-teal-500 to-cyan-400 rounded-t-lg transition-all duration-500"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className="text-xs font-medium text-gray-700">{value.toFixed(0)}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Top Performers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl border border-gray-100 p-6"
          >
            <div className="flex items-center gap-2 mb-6">
              <Award className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-bold text-gray-900">{t("schoolAdmin.analytics.topPerformers.title", "Top Performers")}</h3>
            </div>

            <div className="space-y-4">
              {topPerformers?.data && topPerformers.data.length > 0 ? (
                topPerformers.data.map((student, index) => (
                  <div key={student.id} className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                      index === 0 ? "bg-amber-100 text-amber-600" :
                        index === 1 ? "bg-gray-200 text-gray-600" :
                          index === 2 ? "bg-orange-100 text-orange-600" :
                            "bg-gray-100 text-gray-500"
                    )}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{student.name}</p>
                      <p className="text-xs text-gray-500">{student.completedAssessments} {t("schoolAdmin.analytics.topPerformers.assessments", "assessments")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-teal-600">{student.averageScore.toFixed(1)}%</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">{t("schoolAdmin.analytics.noData", "No data yet")}</p>
                  <p className="text-sm">{t("schoolAdmin.analytics.dataWillAppear", "Performance data will appear here")}</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Completion Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-2xl border border-gray-100 p-6"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-6">{t("schoolAdmin.analytics.completion.title", "Assessment Completion Status")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {overview && (
              <>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Target className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{overview.assessmentCompletion.completed}</p>
                    <p className="text-sm text-gray-500">{t("schoolAdmin.analytics.completion.completed", "Completed")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{overview.assessmentCompletion.inProgress}</p>
                    <p className="text-sm text-gray-500">{t("schoolAdmin.analytics.completion.inProgress", "In Progress")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{overview.assessmentCompletion.notStarted}</p>
                    <p className="text-sm text-gray-500">{t("schoolAdmin.analytics.completion.notStarted", "Not Started")}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
