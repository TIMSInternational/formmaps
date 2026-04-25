"use client";

import { motion } from "motion/react";
import {
  Users,
  UserCheck,
  Clock,
  Activity,
  TrendingUp,
  TrendingDown,
  GraduationCap,
} from "lucide-react";
import { useSchoolAdminStats } from "@/hooks/useSchoolAdmin";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

export function SchoolAdminStats() {
  const { data: stats, isLoading, error } = useSchoolAdminStats();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="col-span-full bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
          <p className="text-red-600 font-medium">Failed to load stats</p>
          <p className="text-red-400 text-sm mt-1">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  const statItems = [
    {
      label: t("schoolAdmin.stats.totalStudents", "Total Students"),
      value: stats.totalStudents.toLocaleString(),
      icon: Users,
      color: "text-teal-600",
      bg: "bg-teal-50/50",
      border: "border-teal-100",
    },
    {
      label: t("schoolAdmin.stats.pending", "Pending Invites"),
      value: stats.pendingInvites.toLocaleString(),
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50/50",
      border: "border-amber-100",
    },
    {
      label: t("schoolAdmin.stats.active", "Active Students"),
      value: stats.activeStudents.toLocaleString(),
      icon: UserCheck,
      color: "text-emerald-600",
      bg: "bg-emerald-50/50",
      border: "border-emerald-100",
    },
    {
      label: t("schoolAdmin.stats.avgScore", "Avg. Score"),
      value: `${stats.averageScore.toFixed(1)}%`,
      icon: GraduationCap,
      color: "text-violet-600",
      bg: "bg-violet-50/50",
      border: "border-violet-100",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {statItems.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`group relative overflow-hidden rounded-2xl border ${item.border} bg-white p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
        >
          <div
            className={`absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full ${item.bg} opacity-40 blur-2xl transition-transform duration-500 group-hover:scale-150`}
          />

          <div className="relative flex flex-col gap-4">
            <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center`}>
              <item.icon className={`h-6 w-6 ${item.color}`} />
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900 tracking-tight">{item.value}</p>
              <p className="text-sm font-medium text-gray-500 mt-1">{item.label}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
