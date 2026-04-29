"use client";

import { motion } from "motion/react";
import { Users, CreditCard, Activity, GraduationCap, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";

export function DashboardStats() {
  const { data: analytics, isLoading, error } = useAdminAnalytics("month");

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="col-span-full rounded-lg border border-border bg-card p-5 text-center">
          <p className="text-destructive text-sm font-medium">Failed to load analytics</p>
        </div>
      </div>
    );
  }

  const { stats } = analytics;

  const statItems = [
    {
      label: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      icon: Users,
      trend: stats.monthlyGrowth.users,
      sub: "from last month",
    },
    {
      label: "Total Revenue",
      value: `$${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: CreditCard,
      trend: stats.monthlyGrowth.revenue,
      sub: "from last month",
    },
    {
      label: "Active Courses",
      value: stats.activeCourses.toLocaleString(),
      icon: GraduationCap,
      trend: stats.monthlyGrowth.courses,
      sub: "from last month",
    },
    {
      label: "Growth Rate",
      value: `${stats.growthRate.toFixed(1)}%`,
      icon: Activity,
      trend: stats.growthRate,
      sub: "Overall platform growth",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {statItems.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-muted-foreground/20"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center">
              <item.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className={`flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded ${
              item.trend >= 0
                ? "text-emerald-500"
                : "text-red-500"
            }`}>
              {item.trend >= 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
              {item.trend >= 0 ? "+" : ""}{Math.abs(item.trend).toFixed(1)}%
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-foreground tracking-tight">{item.value}</h3>
          <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1 flex items-center gap-0.5">
            {item.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {item.sub}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
