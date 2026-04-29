"use client";

import { motion } from "motion/react";
import { Users, CreditCard, Activity, GraduationCap, TrendingUp, TrendingDown } from "lucide-react";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";

export function DashboardStats() {
  const { data: analytics, isLoading, error } = useAdminAnalytics("month");

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: 110, borderRadius: 8, background: "#222", animation: "pulse 2s infinite" }} />
        ))}
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div style={{ padding: 16, borderRadius: 8, border: "1px solid #2a2a2a", background: "#1e1e1e", marginBottom: 24 }}>
        <p style={{ color: "#ef4444", fontSize: 13 }}>Failed to load analytics</p>
      </div>
    );
  }

  const { stats } = analytics;

  const statItems = [
    { label: "Total Users", value: stats.totalUsers.toLocaleString(), icon: Users, trend: stats.monthlyGrowth.users, sub: "from last month" },
    { label: "Total Revenue", value: `$${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: CreditCard, trend: stats.monthlyGrowth.revenue, sub: "from last month" },
    { label: "Active Courses", value: stats.activeCourses.toLocaleString(), icon: GraduationCap, trend: stats.monthlyGrowth.courses, sub: "from last month" },
    { label: "Growth Rate", value: `${stats.growthRate.toFixed(1)}%`, icon: Activity, trend: stats.growthRate, sub: "Overall platform growth" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {statItems.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          style={{
            borderRadius: 8,
            border: "1px solid #2a2a2a",
            background: "#1e1e1e",
            padding: 16,
            transition: "border-color 0.15s",
            cursor: "default",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#333"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: "#2a2a2a",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <item.icon style={{ width: 16, height: 16, color: "#818181" }} />
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 2,
              fontSize: 11, fontWeight: 500,
              color: item.trend >= 0 ? "#10b981" : "#ef4444",
            }}>
              {item.trend >= 0 ? <TrendingUp style={{ width: 12, height: 12 }} /> : <TrendingDown style={{ width: 12, height: 12 }} />}
              {item.trend >= 0 ? "+" : ""}{Math.abs(item.trend).toFixed(1)}%
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: "#ebebeb", letterSpacing: "-0.02em" }}>{item.value}</div>
          <div style={{ fontSize: 12, color: "#818181", marginTop: 4 }}>{item.label}</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}>
            <span>{item.sub}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
