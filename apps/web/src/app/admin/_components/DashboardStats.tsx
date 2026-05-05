"use client";

import { Users, GraduationCap, TrendingUp } from "lucide-react";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { AdminStatCard } from "./AdminStatCard";

export function DashboardStats() {
  const { data: analytics, isLoading, error } = useAdminAnalytics("month");

  const stats = analytics?.stats;

  // Always render cards — show "—" while loading, real data when ready
  const statItems = [
    {
      label: "Total Users",
      value: stats ? stats.totalUsers.toLocaleString() : "—",
      icon: Users,
      trend: stats?.monthlyGrowth?.users ?? 0,
      sub: "vs last month",
    },
    {
      label: "Active Courses",
      value: stats ? stats.activeCourses.toLocaleString() : "—",
      icon: GraduationCap,
      trend: stats?.monthlyGrowth?.courses ?? 0,
      sub: "vs last month",
    },
    {
      label: "Growth",
      value: stats ? `${stats.growthRate.toFixed(1)}%` : "—",
      icon: TrendingUp,
      trend: stats?.growthRate ?? 0,
      sub: "platform growth rate",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {statItems.map((item) => (
        <AdminStatCard key={item.label} {...item} />
      ))}
    </div>
  );
}
