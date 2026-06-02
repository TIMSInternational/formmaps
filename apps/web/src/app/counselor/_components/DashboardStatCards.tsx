"use client";

import { motion } from "motion/react";
import { Users, CalendarClock, AlertTriangle, Send } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

interface DashboardStatCardsProps {
  totalStudents: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  pendingCRCount: number;
  isLoading: boolean;
  dashLoading: boolean;
  crLoading: boolean;
  onRequestsClick: () => void;
}

export function DashboardStatCards({
  totalStudents,
  pendingFollowUps,
  overdueFollowUps,
  pendingCRCount,
  isLoading,
  dashLoading,
  crLoading,
  onRequestsClick,
}: DashboardStatCardsProps) {
  const { t } = useTranslation();

  const stats = [
    { label: t("counselor.dashboard.assignedStudents", "Assigned Students"), value: totalStudents, loading: isLoading, icon: Users, iconColor: "text-indigo-500", iconBg: "bg-indigo-500/10", badge: t("counselor.dashboard.caseload", "Caseload") },
    { label: t("counselor.dashboard.pendingFollowups", "Pending Follow-ups"), value: pendingFollowUps, loading: dashLoading, icon: CalendarClock, iconColor: "text-amber-500", iconBg: "bg-amber-500/10", badge: t("common.due", "Due") },
    { label: t("counselor.dashboard.overdueFollowups", "Overdue Follow-ups"), value: overdueFollowUps, loading: dashLoading, icon: AlertTriangle, iconColor: "text-red-500", iconBg: "bg-red-500/10", badge: "Action" },
    { label: t("counselor.dashboard.changeRequests", "Change Requests"), value: pendingCRCount, loading: crLoading, icon: Send, iconColor: "text-orange-500", iconBg: "bg-orange-500/10", badge: pendingCRCount > 0 ? `${pendingCRCount} pending` : undefined, onClick: onRequestsClick },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05 }}
          className={`dash-card p-5 ${stat.onClick ? "cursor-pointer" : ""}`}
          onClick={stat.onClick}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-9 w-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
              <stat.icon className={`h-4 w-4 ${stat.iconColor}`} strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</span>
          </div>
          {stat.loading ? <Skeleton className="h-8 w-16" /> : (
            <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
          )}
          {stat.badge && (
            <p className="text-[11px] text-muted-foreground mt-1">{stat.badge}</p>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}
