"use client";

import { Users, GraduationCap, TrendingUp } from "lucide-react";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { AdminStatCard } from "./AdminStatCard";

export function DashboardStats() {
  const { data: analytics, isLoading, error } = useAdminAnalytics("month");

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            style={{
              height: 140,
              borderRadius: 8,
              background: "var(--admin-bg-card-hover, #222)",
              animation: "pulse 2s infinite",
            }}
          />
        ))}
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div style={{
        padding: 16, borderRadius: 8,
        border: "1px solid var(--admin-border-default, #2a2a2a)",
        background: "var(--admin-bg-card, #1e1e1e)",
      }}>
        <p style={{ color: "var(--admin-accent-red, #ef4444)", fontSize: 13 }}>Failed to load analytics</p>
      </div>
    );
  }

  const { stats } = analytics;

  // Each card shows a UNIQUE metric — no repetition with the overview card below
  const statItems = [
    {
      label: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      icon: Users,
      trend: stats.monthlyGrowth.users,
      sub: "vs last month",
    },
    {
      label: "Active Courses",
      value: stats.activeCourses.toLocaleString(),
      icon: GraduationCap,
      trend: stats.monthlyGrowth.courses,
      sub: "vs last month",
    },
    {
      label: "Growth",
      value: `${stats.growthRate.toFixed(1)}%`,
      icon: TrendingUp,
      trend: stats.growthRate,
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
