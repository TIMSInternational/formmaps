"use client";

import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

interface SessionCounts {
  all: number;
  upcoming: number;
  past: number;
  cancelled: number;
}

interface SessionStatsGridProps {
  counts: SessionCounts;
}

export function SessionStatsGrid({ counts }: SessionStatsGridProps) {
  const { t } = useTranslation();

  const STATS_CONFIG = [
    { key: "all" as const, label: t("coach:sessionsPage.stats.total"), icon: CalendarIcon, iconColor: "text-[#2E9098]", iconBg: "bg-[#2E9098]/10" },
    { key: "upcoming" as const, label: t("coach:sessionsPage.stats.upcoming"), icon: Clock, iconColor: "text-purple-500", iconBg: "bg-purple-500/10" },
    { key: "past" as const, label: t("coach:sessionsPage.stats.completed"), icon: CheckCircle2, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10" },
    { key: "cancelled" as const, label: t("coach:sessionsPage.stats.cancelled"), icon: XCircle, iconColor: "text-red-500", iconBg: "bg-red-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {STATS_CONFIG.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05 }}
          className="dash-card p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-9 w-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
              <stat.icon className={`h-4 w-4 ${stat.iconColor}`} strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">{counts[stat.key]}</p>
        </motion.div>
      ))}
    </div>
  );
}
