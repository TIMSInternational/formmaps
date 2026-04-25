"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Eye,
  Users,
  Clock,
  CheckCircle,
  TrendingUp,
  FileText,
  Calendar,
  Heart,
  UserPlus,
  Activity,
  ArrowDownRight,
} from "lucide-react";
import { useTelemetryAnalytics } from "@/hooks/useTelemetryAnalytics";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface TelemetryDashboardProps {
  period?: "day" | "week" | "month" | "year";
}

export function TelemetryDashboard({ period = "week" }: TelemetryDashboardProps) {
  const { data: analytics, isLoading, error } = useTelemetryAnalytics(period);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-100 px-3 py-2 rounded-lg shadow-xl z-50">
          <p className="font-medium text-sm mb-1 text-gray-900">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div 
                className="w-2 h-2 rounded-full shrink-0" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-500 capitalize truncate">
                {entry.name}:
              </span>
              <span className="font-medium text-gray-900">
                {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse border-gray-100 shadow-sm bg-white">
              <CardContent className="p-6">
                 <div className="h-10 w-10 bg-gray-100 rounded-xl mb-4" />
                 <div className="h-8 w-24 bg-gray-100 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="flex items-center gap-3 py-6">
          <div className="p-2 rounded-full bg-amber-100">
            <Eye className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="font-medium text-amber-800">Telemetry data unavailable</p>
            <p className="text-sm text-amber-600">
              Backend telemetry API not yet configured. Events are being collected locally.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { metrics } = analytics;
  const eventChartData = Object.entries(metrics.eventBreakdown || {}).map(([event, count]) => ({
    name: event.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    value: count,
  }));
  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };
  const formatPercent = (value: number) => `${Math.round((value || 0) * 100)}%`;

  const telemetryStats = [
      {
        label: "Daily Users",
        value: (metrics.dau || 0).toLocaleString(),
        subtext: "Active within 24h",
        icon: Users,
        color: "text-blue-600",
        bg: "bg-blue-50",
        blobColor: "bg-blue-500"
      },
      {
        label: "Weekly Users",
        value: (metrics.wau || 0).toLocaleString(),
        subtext: "Active past 7 days",
        icon: Calendar,
        color: "text-emerald-600",
        bg: "bg-emerald-50",
        blobColor: "bg-emerald-500"
      },
      {
        label: "Retention Rate",
        value: formatPercent(metrics.retentionRate || 0),
        subtext: "Returning users",
        icon: Heart,
        color: "text-rose-600",
        bg: "bg-rose-50",
        blobColor: "bg-rose-500"
      },
      {
         label: "Avg Duration",
         value: formatDuration(metrics.avgSessionDuration || 0),
         subtext: "Time on site",
         icon: Clock,
         color: "text-amber-600",
         bg: "bg-amber-50",
         blobColor: "bg-amber-500"
      }
  ];

  return (
    <div className="space-y-8">
      {/* Improved Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {telemetryStats.map((stat, index) => (
             <div
                key={index}
                className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            >
                <div
                className={`absolute right-0 top-0 h-24 w-24 translate-x-8 translate-y--8 rounded-full ${stat.blobColor} opacity-5 blur-2xl transition-transform duration-500 group-hover:scale-150`}
                />
                <div className="relative flex flex-col gap-4">
                 <div
                    className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}
                    >
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div>
                    <p className="text-3xl font-bold text-gray-900 tracking-tight">
                    {stat.value}
                    </p>
                    <p className="text-sm font-medium text-gray-500 mt-1">
                    {stat.label}
                    </p>
                </div>
                </div>
            </div>
        ))}
      </div>

      {/* Engagement Overview - Clean Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
              { label: "Page Views", value: (metrics.totalPageViews || 0).toLocaleString(), icon: Eye, bg: "bg-slate-100", text: "text-slate-600" },
              { label: "Pages/Session", value: (metrics.pagesPerSession || 0).toFixed(1), icon: FileText, bg: "bg-indigo-50", text: "text-indigo-600" },
              { label: "Bounce Rate", value: formatPercent(metrics.bounceRate || 0), icon: ArrowDownRight, bg: "bg-orange-50", text: "text-orange-600" },
              { label: "Completion", value: "High", icon: CheckCircle, bg: "bg-green-50", text: "text-green-600" }, // Placeholder for summary
          ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl  hover:shadow-md transition-shadow">
                  <div className={`p-3 rounded-full ${item.bg} ${item.text}`}>
                      <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                      <p className="text-sm font-medium text-gray-500">{item.label}</p>
                      <p className="text-xl font-bold text-gray-900">{item.value}</p>
                  </div>
              </div>
          ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* New vs Returning - Donut Chart */}
        <Card className="border border-gray-100 bg-white rounded-2xl shadow-none hover:shadow-md transition-shadow">
          <CardHeader className="border-b border-gray-50 bg-gray-50/30 py-5">
            <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-1.5">
              <UserPlus className="h-4 w-4 text-blue-500" />
              New vs Returning
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-col items-center">
              {/* Donut Chart */}
              <div className="relative h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'New Users', value: metrics.newUsers || 0, color: '#3b82f6' },
                        { name: 'Returning', value: metrics.returningUsers || 0, color: '#10b981' }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      <Cell fill="#3b82f6" />
                      <Cell fill="#10b981" />
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Stats */}
                <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                  <span className="text-2xl font-bold text-gray-900">
                    {((metrics.newUsers || 0) + (metrics.returningUsers || 0)).toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-500">Total Users</span>
                </div>
              </div>
              
              {/* Legend */}
              <div className="flex items-center justify-center gap-6 mt-4 w-full">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <div className="text-sm">
                    <span className="text-gray-500">New: </span>
                    <span className="font-semibold text-gray-900">{(metrics.newUsers || 0).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <div className="text-sm">
                    <span className="text-gray-500">Returning: </span>
                    <span className="font-semibold text-gray-900">{(metrics.returningUsers || 0).toLocaleString()}</span>
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
              Top Pages
            </CardTitle>
            <CardDescription>Most visited pages by view count</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {(metrics.topPages || []).length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={(metrics.topPages || []).slice(0, 5)}
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
                  <Bar dataKey="views" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-gray-400 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                No page view data available
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
              Event Breakdown
            </CardTitle>
            <CardDescription>Distribution of user actions</CardDescription>
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
                            <span className="text-xs text-gray-500">Events</span>
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
                  No event data available
                </div>
             )}
          </CardContent>
        </Card>

        {/* Completion Rates */}
        <Card className="border border-gray-100 bg-white rounded-2xl shadow-none hover:shadow-md transition-shadow">
          <CardHeader className="border-b border-gray-50 bg-gray-50/30 py-5">
            <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-1.5">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              Completion Rates
            </CardTitle>
            <CardDescription>User journey milestones</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6 mt-2">
              {[
                  { label: "Resume Builder", key: "resumeBuilder", color: "bg-blue-500" },
                  { label: "Assessments", key: "assessments", color: "bg-emerald-500" },
                  { label: "Coach Onboarding", key: "coachOnboarding", color: "bg-violet-500" },
                  { label: "Profile Setup", key: "profileSetup", color: "bg-orange-500" },
              ].map((item) => (
               <div key={item.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                  <span className="font-bold text-gray-900">
                    {Math.round((metrics.completionRates?.[item.key as keyof typeof metrics.completionRates] || 0) * 100)}%
                  </span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${(metrics.completionRates?.[item.key as keyof typeof metrics.completionRates] || 0) * 100}%` }}
                  />
                </div>
              </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DAU Trend Chart */}
      {metrics.dailyActiveUsersTrend && metrics.dailyActiveUsersTrend.length > 0 && (
        <Card className="border border-gray-100 bg-white rounded-2xl shadow-none hover:shadow-md transition-shadow">
          <CardHeader className="border-b border-gray-50 bg-gray-50/30 py-5">
            <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-1.5">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              Daily Active Users Trend
            </CardTitle>
            <CardDescription>30-day active user history</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={metrics.dailyActiveUsersTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
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
                  stroke="#3b82f6"
                  fill="url(#colorTrend)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
