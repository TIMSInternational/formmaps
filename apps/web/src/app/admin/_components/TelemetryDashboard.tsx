"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Eye,
  Users,
  Clock,
  CheckCircle,
  FileText,
  Calendar,
  Heart,
  ArrowDownRight,
} from "lucide-react";
import { useTelemetryAnalytics } from "@/hooks/useTelemetryAnalytics";
import { TelemetryCharts } from "./TelemetryCharts";

interface TelemetryDashboardProps {
  period?: "day" | "week" | "month" | "year";
}

export const TelemetryDashboard = React.memo(function TelemetryDashboard({ period = "week" }: TelemetryDashboardProps) {
  const { data: analytics, isLoading, error } = useTelemetryAnalytics(period);

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-100 px-3 py-2 rounded-lg shadow-xl z-50">
          <p className="font-medium text-sm mb-1 text-gray-900">{label}</p>
          {payload.map((entry, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-500 capitalize truncate">{entry.name}:</span>
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
    { label: "Daily Users", value: (metrics.dau || 0).toLocaleString(), subtext: "Active within 24h", icon: Users, color: "text-blue-600", bg: "bg-blue-50", blobColor: "bg-blue-500" },
    { label: "Weekly Users", value: (metrics.wau || 0).toLocaleString(), subtext: "Active past 7 days", icon: Calendar, color: "text-emerald-600", bg: "bg-emerald-50", blobColor: "bg-emerald-500" },
    { label: "Retention Rate", value: formatPercent(metrics.retentionRate || 0), subtext: "Returning users", icon: Heart, color: "text-rose-600", bg: "bg-rose-50", blobColor: "bg-rose-500" },
    { label: "Avg Duration", value: formatDuration(metrics.avgSessionDuration || 0), subtext: "Time on site", icon: Clock, color: "text-amber-600", bg: "bg-amber-50", blobColor: "bg-amber-500" },
  ];

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {telemetryStats.map((stat, index) => (
          <div key={index} className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className={`absolute right-0 top-0 h-24 w-24 translate-x-8 translate-y--8 rounded-full ${stat.blobColor} opacity-5 blur-2xl transition-transform duration-500 group-hover:scale-150`} />
            <div className="relative flex flex-col gap-4">
              <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{stat.value}</p>
                <p className="text-sm font-medium text-gray-500 mt-1">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Engagement Overview */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Page Views", value: (metrics.totalPageViews || 0).toLocaleString(), icon: Eye, bg: "bg-slate-100", text: "text-slate-600" },
          { label: "Pages/Session", value: (metrics.pagesPerSession || 0).toFixed(1), icon: FileText, bg: "bg-indigo-50", text: "text-indigo-600" },
          { label: "Bounce Rate", value: formatPercent(metrics.bounceRate || 0), icon: ArrowDownRight, bg: "bg-orange-50", text: "text-orange-600" },
          { label: "Completion", value: "High", icon: CheckCircle, bg: "bg-green-50", text: "text-green-600" },
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

      <TelemetryCharts
        newUsers={metrics.newUsers || 0}
        returningUsers={metrics.returningUsers || 0}
        topPages={metrics.topPages || []}
        eventChartData={eventChartData}
        completionRates={metrics.completionRates || {}}
        dailyActiveUsersTrend={metrics.dailyActiveUsersTrend || []}
        CustomTooltip={CustomTooltip}
      />
    </div>
  );
});
