"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  UserPlus,
  TrendingUp,
  Activity,
  CheckCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

const COLORS = ["#2E9098", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface EventChartItem {
  name: string;
  value: number;
}

interface TopPage {
  page: string;
  views: number;
}

interface DailyTrendItem {
  date: string;
  users: number;
}

interface CompletionRates {
  resumeBuilder?: number;
  assessments?: number;
  coachOnboarding?: number;
  profileSetup?: number;
}

interface TelemetryChartsProps {
  newUsers: number;
  returningUsers: number;
  topPages: TopPage[];
  eventChartData: EventChartItem[];
  completionRates: CompletionRates;
  dailyActiveUsersTrend: DailyTrendItem[];
  CustomTooltip: React.ComponentType<{ active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }>;
}

export const TelemetryCharts = React.memo(function TelemetryCharts({
  newUsers,
  returningUsers,
  topPages,
  eventChartData,
  completionRates,
  dailyActiveUsersTrend,
  CustomTooltip,
}: TelemetryChartsProps) {
  const { t } = useTranslation("platform_owner");

  return (
    <>
      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* New vs Returning - Donut Chart */}
        <Card className="border border-gray-100 bg-white rounded-2xl shadow-none hover:shadow-md transition-shadow">
          <CardHeader className="border-b border-gray-50 bg-gray-50/30 py-5">
            <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-1.5">
              <UserPlus className="h-4 w-4 text-blue-500" />
              {t("telemetry.charts.newVsReturning")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-col items-center">
              <div className="relative h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: t("telemetry.charts.newLabel").replace(": ", ""), value: newUsers, color: '#2E9098' },
                        { name: t("telemetry.charts.returningLabel").replace(": ", ""), value: returningUsers, color: '#10b981' }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      <Cell fill="#2E9098" />
                      <Cell fill="#10b981" />
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                  <span className="text-2xl font-bold text-gray-900">
                    {(newUsers + returningUsers).toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-500">{t("telemetry.charts.totalUsersLabel")}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 mt-4 w-full">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <div className="text-sm">
                    <span className="text-gray-500">{t("telemetry.charts.newLabel")}</span>
                    <span className="font-semibold text-gray-900">{newUsers.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <div className="text-sm">
                    <span className="text-gray-500">{t("telemetry.charts.returningLabel")}</span>
                    <span className="font-semibold text-gray-900">{returningUsers.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Pages */}
        <Card className="col-span-2 border border-gray-100 bg-white rounded-2xl shadow-none hover:shadow-md transition-shadow">
          <CardHeader className="border-b border-gray-50 bg-gray-50/30 py-5">
            <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-1.5">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              {t("telemetry.charts.topPages")}
            </CardTitle>
            <CardDescription>{t("telemetry.charts.topPagesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {topPages.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={topPages.slice(0, 5)}
                  layout="vertical"
                  margin={{ left: 10, right: 30, top: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" opacity={0.5} />
                  <XAxis type="number" tickFormatter={(v) => v.toLocaleString()} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="page"
                    width={140}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickFormatter={(v) => typeof v === 'string' ? (v.replace("/dashboard", "").slice(0, 25) || "/home") : String(v)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip cursor={{fill: 'rgba(0,0,0,0.02)'}} content={<CustomTooltip />} />
                  <Bar dataKey="views" fill="#2E9098" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-gray-400 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                {t("telemetry.charts.noPageData")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Event Breakdown & Completion Rates */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Event Breakdown */}
        <Card className="border border-gray-100 bg-white rounded-2xl shadow-none hover:shadow-md transition-shadow">
           <CardHeader className="border-b border-gray-50 bg-gray-50/30 py-5">
            <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-1.5">
              <Activity className="h-5 w-5 text-violet-500" />
              {t("telemetry.charts.eventBreakdown")}
            </CardTitle>
            <CardDescription>{t("telemetry.charts.eventBreakdownDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
             {eventChartData.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4 items-center">
                    <div className="h-[200px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                            data={eventChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            >
                            {eventChartData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                            ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                            <span className="text-2xl font-bold text-gray-900">{eventChartData.reduce((a,b) => a + b.value, 0)}</span>
                            <span className="text-xs text-gray-500">{t("telemetry.charts.totalEventsLabel")}</span>
                        </div>
                    </div>
                    <div className="space-y-3">
                         {eventChartData.slice(0, 5).map((item, index) => (
                             <div key={index} className="flex items-center justify-between text-sm">
                                 <div className="flex items-center gap-2">
                                     <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                     <span className="text-gray-600 truncate max-w-[120px]">{item.name}</span>
                                 </div>
                                 <span className="font-medium text-gray-900">{item.value}</span>
                             </div>
                         ))}
                    </div>
                </div>
             ) : (
                <div className="flex items-center justify-center h-[200px] text-gray-400 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                  {t("telemetry.charts.noEventData")}
                </div>
             )}
          </CardContent>
        </Card>

        {/* Completion Rates */}
        <Card className="border border-gray-100 bg-white rounded-2xl shadow-none hover:shadow-md transition-shadow">
          <CardHeader className="border-b border-gray-50 bg-gray-50/30 py-5">
            <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-1.5">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              {t("telemetry.charts.completionRates")}
            </CardTitle>
            <CardDescription>{t("telemetry.charts.userJourneyMilestones")}</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6 mt-2">
              {[
                  { labelKey: "telemetry.charts.resumeBuilder", key: "resumeBuilder" as const, color: "bg-blue-500" },
                  { labelKey: "telemetry.charts.assessments", key: "assessments" as const, color: "bg-emerald-500" },
                  { labelKey: "telemetry.charts.coachOnboarding", key: "coachOnboarding" as const, color: "bg-violet-500" },
                  { labelKey: "telemetry.charts.profileSetup", key: "profileSetup" as const, color: "bg-orange-500" },
              ].map((item) => (
               <div key={item.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{t(item.labelKey)}</span>
                  <span className="font-bold text-gray-900">
                    {Math.round((completionRates[item.key] || 0) * 100)}%
                  </span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${(completionRates[item.key] || 0) * 100}%` }}
                  />
                </div>
              </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DAU Trend Chart */}
      {dailyActiveUsersTrend && dailyActiveUsersTrend.length > 0 && (
        <Card className="border border-gray-100 bg-white rounded-2xl shadow-none hover:shadow-md transition-shadow">
          <CardHeader className="border-b border-gray-50 bg-gray-50/30 py-5">
            <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-1.5">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              {t("telemetry.charts.dauTrend")}
            </CardTitle>
            <CardDescription>{t("telemetry.charts.dauTrendDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyActiveUsersTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2E9098" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2E9098" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                />
                <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    dx={-5}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="users"
                  stroke="#2E9098"
                  fill="url(#colorTrend)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </>
  );
});
