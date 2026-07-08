"use client";

import React, { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Users,
  Calendar,
  Star,
  Wallet,
  Clock,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import {
  getCoachAnalytics,
  getCoachAnalyticsReport,
} from "@/services/coachService";
import type { CoachAnalytics } from "@/types/coach";
import { toast } from "sonner";
import { motion } from "motion/react";

interface ChartDataPoint {
  name: string;
  amount: number;
  sessions: number;
}

interface MonthlyDataItem {
  month?: string;
  label?: string;
  earnings?: number;
  amount?: number;
  sessions?: number;
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30d");
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalSessions: 0,
    averageRating: 0,
    clientCount: 0,
  });

  const extractAnalytics = (res: { data?: CoachAnalytics } | CoachAnalytics) => {
    const analytics = (res as { data?: CoachAnalytics }).data ?? (res as CoachAnalytics);
    if (!analytics) return;

    setStats({
      totalEarnings: analytics.totalEarnings ?? 0,
      totalSessions: analytics.totalSessions ?? 0,
      averageRating: analytics.averageRating ?? 0,
      clientCount: analytics.clientCount ?? analytics.activeStudents ?? 0,
    });

    const monthly: MonthlyDataItem[] = analytics.monthlyData ?? analytics.earningsHistory ?? [];
    if (Array.isArray(monthly) && monthly.length > 0) {
      setChartData(
        monthly.map((h: MonthlyDataItem) => ({
          name: h.month || h.label || "",
          amount: h.earnings ?? h.amount ?? 0,
          sessions: h.sessions ?? 0,
        }))
      );
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        const res = await getCoachAnalytics();
        extractAnalytics(res);
      } catch {
        // silently handle
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnalytics();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const refetch = async () => {
      try {
        const res = await getCoachAnalytics(dateRange);
        const analytics = res?.data ?? (res as unknown as CoachAnalytics);
        const monthly: MonthlyDataItem[] = analytics?.monthlyData ?? analytics?.earningsHistory ?? [];
        if (Array.isArray(monthly) && monthly.length > 0) {
          setChartData(
            monthly.map((h: MonthlyDataItem) => ({
              name: h.month || h.label || "",
              amount: h.earnings ?? h.amount ?? 0,
              sessions: h.sessions ?? 0,
            }))
          );
        }
      } catch {
        // keep existing data
      }
    };
    refetch();
  }, [dateRange, user?.id]);

  const handleDownloadReport = async () => {
    try {
      const report = await getCoachAnalyticsReport(undefined, undefined, "csv");
      if (report instanceof Blob) {
        const url = URL.createObjectURL(report);
        const link = document.createElement("a");
        link.href = url;
        link.download = `analytics_${dateRange}_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(t("coaching.dashboard.reportDownloaded"));
        return;
      }
      // Fallback CSV
      const csvContent = "data:text/csv;charset=utf-8," +
        "Metric,Value\n" +
        `Total Earnings,${stats.totalEarnings}\n` +
        `Total Sessions,${stats.totalSessions}\n` +
        `Average Rating,${stats.averageRating}\n` +
        `Active Students,${stats.clientCount}\n`;
      const link = document.createElement("a");
      link.setAttribute("href", encodeURI(csvContent));
      link.setAttribute("download", `analytics_${dateRange}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(t("coaching.dashboard.reportDownloaded"));
    } catch {
      toast.error(t("coach:analytics.chart.earningsTooltip"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totalRevenue = chartData.reduce((s, d) => s + (d.amount || 0), 0);
  const dateRangeLabelMap: Record<string, string> = {
    "7d": t("coach:analytics.dateRange.7d"),
    "30d": t("coach:analytics.dateRange.30d"),
    "3m": t("coach:analytics.dateRange.3m"),
    "ytd": t("coach:analytics.dateRange.ytd"),
  };
  const dateRangeLabel = dateRangeLabelMap[dateRange] ?? dateRange;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{t("coach:analytics.sectionLabel")}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mt-1">
            {t("coach:analytics.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("coach:analytics.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[150px]">
              <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t("coach:analytics.dateRange.7d")}</SelectItem>
              <SelectItem value="30d">{t("coach:analytics.dateRange.30d")}</SelectItem>
              <SelectItem value="3m">{t("coach:analytics.dateRange.3m")}</SelectItem>
              <SelectItem value="ytd">{t("coach:analytics.dateRange.ytd")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={handleDownloadReport}>
            <Download className="h-4 w-4" />
            {t("coach:analytics.export")}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("coach:analytics.stats.totalEarnings"), value: `$${stats.totalEarnings.toLocaleString()}`, icon: Wallet, iconColor: "text-[#2E9098]", iconBg: "bg-[#2E9098]/10" },
          { label: t("coach:analytics.stats.totalSessions"), value: stats.totalSessions, icon: Clock, iconColor: "text-purple-500", iconBg: "bg-purple-500/10" },
          { label: t("coach:analytics.stats.avgRating"), value: stats.averageRating?.toFixed ? stats.averageRating.toFixed(1) : stats.averageRating, icon: Star, iconColor: "text-amber-500", iconBg: "bg-amber-500/10" },
          { label: t("coach:analytics.stats.activeStudents"), value: stats.clientCount, icon: Users, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="dash-card p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-9 w-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.iconColor}`} strokeWidth={1.8} />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Earnings Chart */}
      <div className="dash-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <span className="text-sm font-semibold text-foreground">{t("coach:analytics.chart.title")}</span>
            <p className="text-xs text-muted-foreground mt-0.5">{t("coach:analytics.chart.subtitle")}</p>
          </div>
          <div className="flex items-center gap-6 text-right">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{dateRangeLabel}</p>
              <p className="text-xl font-bold text-foreground">${totalRevenue.toLocaleString()}</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("coach:analytics.chart.sessions")}</p>
              <p className="text-xl font-bold text-foreground">{stats.totalSessions}</p>
            </div>
            <div className="hidden md:block">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("coach:analytics.chart.avgRating")}</p>
              <p className="text-xl font-bold text-foreground flex items-center justify-end gap-1">
                {stats.averageRating?.toFixed ? stats.averageRating.toFixed(1) : stats.averageRating}
                <Star className="h-3.5 w-3.5 text-amber-400 fill-current" />
              </p>
            </div>
          </div>
        </div>

        <div className="px-2 sm:px-6 py-6">
          <div className="h-[350px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border, #E5E7EB)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 12, fontWeight: 500 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} tick={{ fill: "#6B7280", fontSize: 12, fontWeight: 500 }} />
                  <Tooltip
                    formatter={(value) => [`$${value}`, t("coach:analytics.chart.earningsTooltip")]}
                    contentStyle={{ backgroundColor: "var(--card, #fff)", borderRadius: "12px", border: "1px solid var(--border, #e5e7eb)", padding: "12px", fontWeight: 600, color: "var(--foreground, #1F2937)" }}
                    cursor={{ stroke: "#3B82F6", strokeWidth: 2, strokeDasharray: "5 5" }}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorEarnings)" activeDot={{ r: 6, strokeWidth: 0, fill: "#2563EB" }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                {t("coach:analytics.chart.noData")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      {chartData.length > 0 && (
        <div className="dash-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <span className="text-sm font-semibold text-foreground">{t("coach:analytics.breakdown.title")}</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {chartData.map((month, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] transition-colors">
                <span className="text-sm font-medium text-foreground">{month.name}</span>
                <div className="flex items-center gap-6">
                  <span className="text-sm text-muted-foreground">{month.sessions} {t("coach:analytics.chart.sessions_label")}</span>
                  <span className="text-sm font-bold text-emerald-600">${month.amount.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
