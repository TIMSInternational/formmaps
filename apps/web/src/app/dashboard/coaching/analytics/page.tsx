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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Activity,
  Wallet,
  Clock,
  Download,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGlobalStore } from "@/store/useGlobalStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  getCoachAnalytics,
  getCoachAnalyticsReport,
} from "@/services/coachService";
import { toast } from "sonner";

// Empty defaults — real data loaded from API
const EMPTY_CHART_DATA: any[] = [];
const EMPTY_SESSION_DISTRIBUTION: any[] = [];
const EMPTY_RECENT_ACTIVITY: any[] = [];

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30d");
  const [chartData, setChartData] = useState<any[]>(EMPTY_CHART_DATA);
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalSessions: 0,
    averageRating: 0,
    activeStudents: 0,
  });
  const [sessionDistribution, setSessionDistribution] = useState<any[]>(
    EMPTY_SESSION_DISTRIBUTION
  );
  const [recentActivity, setRecentActivity] = useState<any[]>(EMPTY_RECENT_ACTIVITY);
  const COLOR_PALETTE = [
    "#3B82F6",
    "#10B981",
    "#8B5CF6",
    "#F59E0B",
    "#EF4444",
    "#06B6D4",
  ];

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        const res = await getCoachAnalytics();
        const analytics = res?.data;
        if (analytics) {
          setStats({
            totalEarnings: analytics.totalEarnings,
            totalSessions: analytics.totalSessions,
            averageRating: analytics.averageRating,
            activeStudents: analytics.activeStudents,
          });
          // Map earningsHistory to chart format
          if (
            Array.isArray(analytics.earningsHistory) &&
            analytics.earningsHistory.length > 0
          ) {
            setChartData(
              analytics.earningsHistory.map((h: any) => ({
                name: h.month,
                amount: h.amount,
              }))
            );
          }
          if (
            Array.isArray(analytics.sessionDistribution) &&
            analytics.sessionDistribution.length > 0
          ) {
            setSessionDistribution(
              analytics.sessionDistribution.map((d: any, idx: number) => ({
                name: (d.topic || d.name || "")
                  .replace(/-|_/g, " ")
                  .replace(/\b\w/g, (c: string) => c.toUpperCase()),
                value: d.count,
                color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
              }))
            ); // humanize and color
          }
          if (
            Array.isArray(analytics.recentActivity) &&
            analytics.recentActivity.length > 0
          ) {
            setRecentActivity(
              analytics.recentActivity.map((r: any) => {
                const message = r.message || "";
                const userFromMessage = message.includes(" booked")
                  ? message.split(" booked")[0]
                  : null;
                let user = userFromMessage || "";
                if (!user) {
                  const tokens = message.split(" ");
                  user =
                    tokens.length >= 2
                      ? `${tokens[0]} ${tokens[1]}`
                      : tokens[0] || "User";
                }
                return {
                  id: r.id,
                  user,
                  action: r.message,
                  time: r.date ? new Date(r.date).toLocaleString() : "",
                  type: r.type || "booking",
                  amount: r.amount,
                  rating: r.rating,
                };
              })
            ); // adapt shape
          }
        }
      } catch (error) {
      // error handled silently
    } finally {
        setIsLoading(false);
      }
    };

    if (user?.id) {
      fetchAnalytics();
    }
  }, [user?.id]);

  // Re-fetch analytics when date range changes
  useEffect(() => {
    if (user?.id) {
      const refetch = async () => {
        try {
          const res = await getCoachAnalytics(dateRange);
          const analytics = res?.data;
          if (analytics?.earningsHistory?.length > 0) {
            setChartData(
              analytics.earningsHistory.map((h: any) => ({
                name: h.month || h.label,
                amount: h.amount,
              }))
            );
          }
        } catch {
          // keep existing data
        }
      };
      refetch();
    }
  }, [dateRange, user?.id]);

  const handleDownloadReport = async () => {
    try {
      // Pull report from API
      const report = await getCoachAnalyticsReport(undefined, undefined, "csv");
      if (report instanceof Blob) {
        const url = URL.createObjectURL(report);
        const link = document.createElement("a");
        link.href = url;
        link.download = `analytics_report_${dateRange}_${
          new Date().toISOString().split("T")[0]
        }.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(t("coaching.dashboard.reportDownloaded"));
        return;
      }

      // Fallback: create CSV content if blob not returned
      const headers = ["Metric", "Value"];
      const rows = [
        ["Total Earnings", stats.totalEarnings],
        ["Total Sessions", stats.totalSessions],
        ["Average Rating", stats.averageRating],
        ["Active Students", stats.activeStudents],
        ["Date Range", dateRange],
      ];

      const csvContent =
        "data:text/csv;charset=utf-8," +
        headers.join(",") +
        "\n" +
        rows.map((e) => e.join(",")).join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute(
        "download",
        `analytics_report_${dateRange}_${
          new Date().toISOString().split("T")[0]
        }.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(t("coaching.dashboard.reportDownloaded"));
    } catch (error) {
      toast.error("Failed to download report");
    }
  };

  // StatCard
  const StatCard = ({
    title,
    value,
    icon: Icon,
    trend = "up",
    trendValue,
    gradient = "from-blue-500 to-blue-600",
    shadow = "shadow-blue-500/20",
    iconColor = "text-blue-600",
    bg = "bg-blue-50",
  }: any) => (
    <div className="dash-card p-6 transition-all duration-300">
      <div className="flex flex-col justify-between h-full gap-4">
        <div className="flex justify-between items-start">
          <div
            className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg text-white bg-gradient-to-br",
              gradient,
              shadow
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={2} />
          </div>
          {trend && (
            <div
              className={cn(
                "flex items-center px-2.5 py-1 rounded-full text-xs font-bold border shadow-sm bg-white/80 backdrop-blur-sm",
                trend === "up"
                  ? "text-green-600 border-green-100"
                  : "text-red-500 border-red-100"
              )}
            >
              {trend === "up" ? (
                <ArrowUpRight className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDownRight className="h-3 w-3 mr-1" />
              )}
              {trendValue}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-3xl font-extrabold tracking-tight mt-2 text-foreground">
            {value}
          </h3>
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mt-1">
            {title}
          </p>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Performance</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Performance Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track your growth, earnings, and student engagement
            </p>
          </div>
          <div className="dash-card p-1.5 flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[160px] bg-transparent border-none focus:ring-0 shadow-none font-semibold text-foreground">
                <Calendar className="mr-2 h-4 w-4 text-blue-500" />
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="3m">Last 3 Months</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
              </SelectContent>
            </Select>
            <div className="w-px h-8 bg-gray-200" />
            <Button
              variant="default"
              className="bg-gray-900 text-white hover:bg-black rounded-xl shadow-lg shadow-gray-900/10"
              onClick={handleDownloadReport}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Earnings"
            value={`$${stats.totalEarnings.toLocaleString()}`}
            icon={Wallet}
            gradient="from-blue-500 to-blue-600"
            shadow="shadow-blue-500/20"
          />
          <StatCard
            title="Total Sessions"
            value={stats.totalSessions}
            icon={Clock}
            gradient="from-violet-500 to-purple-600"
            shadow="shadow-purple-500/20"
          />
          <StatCard
            title="Average Rating"
            value={stats.averageRating}
            icon={Star}
            gradient="from-amber-400 to-orange-500"
            shadow="shadow-orange-500/20"
          />
          <StatCard
            title="Active Students"
            value={stats.activeStudents}
            icon={Users}
            gradient="from-emerald-400 to-green-500"
            shadow="shadow-green-500/20"
          />
        </div>

        {/* Main Content Grid */}
        <div className="space-y-8">
          {/* Earnings Chart - Full Width */}
          <Card className="dash-card overflow-hidden">
            <CardHeader className="border-b border-[var(--border)] pb-4">
              <div className="flex justify-between items-center px-2">
                <div>
                  <CardTitle className="text-xl font-bold text-foreground">
                    Earnings Overview
                  </CardTitle>
                  <CardDescription className="text-muted-foreground font-medium mt-1">
                    Financial performance over time
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-900"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <div className="px-8 py-6 bg-gradient-to-b from-white/50 to-transparent">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-1 rounded-md inline-block">
                    {dateRange === "7d"
                      ? "Last 7 Days"
                      : dateRange === "30d"
                      ? "Last 30 Days"
                      : dateRange === "3m"
                      ? "Last 3 Months"
                      : "Year to Date"}
                  </div>
                  <div className="text-3xl font-extrabold text-foreground">
                    $
                    {(chartData || [])
                      .reduce((s, d) => s + (d.amount || 0), 0)
                      .toLocaleString()}
                    <span className="text-sm font-medium text-muted-foreground ml-2 align-middle">
                      Total Revenue
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Sessions
                    </div>
                    <div className="text-2xl font-bold text-foreground">
                      {stats.totalSessions}
                    </div>
                  </div>
                  <div className="text-right hidden md:block">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Avg Rating
                    </div>
                    <div className="text-2xl font-bold text-foreground flex items-center justify-end gap-1">
                      {stats.averageRating?.toFixed
                        ? stats.averageRating.toFixed(1)
                        : stats.averageRating}
                      <Star className="h-4 w-4 text-amber-400 fill-current" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <CardContent className="px-2 sm:px-6 pb-6 pt-0">
              <div className="h-[400px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorEarnings"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3B82F6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3B82F6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E5E7EB"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#6B7280", fontSize: 12, fontWeight: 500 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => `$${value}`}
                      tick={{ fill: "#6B7280", fontSize: 12, fontWeight: 500 }}
                    />
                    <Tooltip
                      formatter={(value) => [`$${value}`, "Earnings"]}
                      contentStyle={{
                        backgroundColor: "rgba(255, 255, 255, 0.9)",
                        backdropFilter: "blur(10px)",
                        borderRadius: "16px",
                        border: "1px solid rgba(255,255,255,0.5)",
                        boxShadow:
                          "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
                        padding: "16px",
                        fontWeight: 600,
                        color: "#1F2937",
                      }}
                      cursor={{
                        stroke: "#3B82F6",
                        strokeWidth: 2,
                        strokeDasharray: "5 5",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#3B82F6"
                      strokeWidth={4}
                      fillOpacity={1}
                      fill="url(#colorEarnings)"
                      activeDot={{ r: 8, strokeWidth: 0, fill: "#2563EB" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Bottom Row: Session Types & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Session Types */}
            <Card className="dash-card">
              <CardHeader className="border-b border-[var(--border)] pb-4">
                <CardTitle className="text-xl font-bold text-foreground">
                  Session Types
                </CardTitle>
                <CardDescription className="font-medium text-muted-foreground">
                  Distribution by topic
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="h-[300px] w-full relative flex flex-col lg:flex-row lg:items-center gap-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sessionDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={110}
                        paddingAngle={5}
                        cornerRadius={8}
                        dataKey="value"
                        stroke="none"
                      >
                        {sessionDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.9)",
                          backdropFilter: "blur(4px)",
                          borderRadius: "12px",
                          border: "none",
                          boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                          fontWeight: 600,
                          color: "#1F2937",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Legend list */}
                  <div className="w-full lg:w-1/2 flex flex-col gap-3 px-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Topics Breakdown
                    </div>
                    {sessionDistribution.map((item, idx) => {
                      const total =
                        sessionDistribution.reduce(
                          (s, x) => s + (x.value || 0),
                          0
                        ) || 1;
                      const pct = Math.round(((item.value || 0) / total) * 100);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="h-3 w-3 rounded-full shadow-sm ring-2 ring-white"
                              style={{ backgroundColor: item.color }}
                            />
                            <div className="text-sm font-semibold text-foreground">
                              {item.name}
                            </div>
                          </div>
                          <div className="text-sm font-bold text-muted-foreground">
                            {pct}%{" "}
                            <span className="text-muted-foreground font-normal ml-1">
                              ({item.value})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="dash-card">
              <CardHeader className="border-b border-[var(--border)] pb-4">
                <CardTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
                  <Activity className="h-5 w-5 text-blue-500" />
                  Recent Activity
                </CardTitle>
                <CardDescription className="font-medium text-muted-foreground">
                  Latest actions and updates
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                  {recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between group hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] p-3 rounded-2xl transition-all duration-200 border border-transparent hover:shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-11 w-11 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ring-2 ring-white
                        ${
                          activity.type === "booking"
                            ? "bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700"
                            : activity.type === "review"
                            ? "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700"
                            : activity.type === "completion"
                            ? "bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700"
                            : "bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700"
                        }`}
                        >
                          {activity.user.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground group-hover:text-blue-600 transition-colors">
                            {activity.user}
                          </p>
                          <p className="text-xs font-medium text-muted-foreground mt-0.5">
                            {activity.action}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {activity.amount && (
                          <p className="text-sm font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-lg inline-block">
                            {activity.amount}
                          </p>
                        )}
                        {activity.rating && (
                          <div className="flex items-center justify-end text-amber-500 bg-amber-50 px-2 py-0.5 rounded-lg">
                            <Star className="h-3 w-3 fill-current" />
                            <span className="text-xs ml-1 font-bold">
                              {activity.rating}.0
                            </span>
                          </div>
                        )}
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">
                          {activity.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-center">
                  <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground font-semibold"
                    onClick={() =>
                      toast.info("Open full activity log coming soon")
                    }
                  >
                    View all activity <ArrowUpRight className="ml-2 h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
