"use client";

import { motion } from "motion/react";
import { Users, CreditCard, Activity, GraduationCap, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";

export function DashboardStats() {
  const { data: analytics, isLoading, error } = useAdminAnalytics("month");

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="col-span-full bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
          <p className="text-red-600 font-medium">Failed to load analytics data</p>
          <p className="text-red-400 text-sm mt-1">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  const { stats } = analytics;

  const statItems = [
    {
      label: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      subValue: `${stats.monthlyGrowth.users >= 0 ? "+" : ""}${stats.monthlyGrowth.users.toFixed(1)}% from last month`,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50/50",
      border: "border-blue-100",
      trend: stats.monthlyGrowth.users >= 0 ? "up" : "down",
      trendValue: stats.monthlyGrowth.users,
    },
    {
      label: "Total Revenue",
      value: `$${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      subValue: `${stats.monthlyGrowth.revenue >= 0 ? "+" : ""}${stats.monthlyGrowth.revenue.toFixed(1)}% from last month`,
      icon: CreditCard,
      color: "text-green-600",
      bg: "bg-green-50/50",
      border: "border-green-100",
      trend: stats.monthlyGrowth.revenue >= 0 ? "up" : "down",
      trendValue: stats.monthlyGrowth.revenue,
    },
    {
      label: "Active Courses",
      value: stats.activeCourses.toLocaleString(),
      subValue: `${stats.monthlyGrowth.courses >= 0 ? "+" : ""}${stats.monthlyGrowth.courses.toFixed(1)}% from last month`,
      icon: GraduationCap,
      color: "text-purple-600",
      bg: "bg-purple-50/50",
      border: "border-purple-100",
      trend: stats.monthlyGrowth.courses >= 0 ? "up" : "down",
      trendValue: stats.monthlyGrowth.courses,
    },
    {
      label: "Growth Rate",
      value: `${stats.growthRate.toFixed(1)}%`,
      subValue: "Overall platform growth",
      icon: Activity,
      color: "text-orange-600",
      bg: "bg-orange-50/50",
      border: "border-orange-100",
      trend: stats.growthRate >= 0 ? "up" : "down",
      trendValue: stats.growthRate,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {statItems.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`group relative overflow-hidden rounded-2xl border ${item.border} bg-white p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
        >
          <div className={`absolute right-0 top-0 h-24 w-24 translate-x-8 translate-y--8 rounded-full ${item.bg} opacity-20 blur-2xl transition-transform duration-500 group-hover:scale-150`} />

          <div className="relative flex flex-col justify-between h-full">
            <div className="flex justify-between items-start mb-4">
              <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              {item.trend === "up" ? (
                <div className="flex items-center text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +{Math.abs(item.trendValue).toFixed(1)}%
                </div>
              ) : (
                <div className="flex items-center text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  -{Math.abs(item.trendValue).toFixed(1)}%
                </div>
              )}
            </div>

            <div>
              <h3 className="text-3xl font-bold text-gray-900 tracking-tight">{item.value}</h3>
              <p className="text-sm font-medium text-gray-500 mt-1">{item.label}</p>
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                {item.trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {item.subValue}
              </p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
