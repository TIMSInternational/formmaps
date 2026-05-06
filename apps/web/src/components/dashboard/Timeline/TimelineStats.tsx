"use client";

import React from "react";
import { motion } from "motion/react";
import {
  CheckCircle2,
  Clock,
  Brain,
  Users,
  ClipboardCheck,
  BookOpen,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimelineStats as TimelineStatsType } from "@/types/timeline";
import { useGlobalStore } from "@/store/useGlobalStore";
import { formatDistanceToNow } from "date-fns";
import { es, enUS } from "date-fns/locale";

interface TimelineStatsProps {
  stats?: TimelineStatsType;
  isLoading?: boolean;
}

export function TimelineStats({ stats, isLoading }: TimelineStatsProps) {
  const { language } = useGlobalStore();
  const locale = language === "spanish" ? es : enUS;

  if (isLoading) {
    return (
      <div className="dash-card p-4 animate-pulse">
        <div className="h-20 bg-secondary rounded-lg" />
      </div>
    );
  }

  if (!stats) return null;

  const lastActivity = stats.recentActivity.lastActivityDate
    ? formatDistanceToNow(new Date(stats.recentActivity.lastActivityDate), {
        addSuffix: true,
        locale,
      })
    : language === "spanish"
    ? "Sin actividad"
    : "No activity";

  const pct = stats.overallCompletion.percentage;

  const assessments = [
    {
      icon: ClipboardCheck,
      label: "PCA",
      status: stats.assessmentBreakdown.pca.status,
      detail: null,
    },
    {
      icon: Brain,
      label: "LIA",
      status: stats.assessmentBreakdown.mil.status,
      detail: `${stats.assessmentBreakdown.mil.completedSubtests}/${stats.assessmentBreakdown.mil.totalSubtests}`,
    },
    {
      icon: Users,
      label: "360°",
      status: stats.assessmentBreakdown.evaluation.status,
      detail: `${stats.assessmentBreakdown.evaluation.completedEvaluations}/${stats.assessmentBreakdown.evaluation.totalEvaluators}`,
    },
    {
      icon: BookOpen,
      label: language === "spanish" ? "Cursos" : "Courses",
      status:
        stats.assessmentBreakdown.courses.completed > 0
          ? "in_progress"
          : "not_started",
      detail: `${stats.assessmentBreakdown.courses.completed}`,
    },
  ];

  return (
    <div className="dash-card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Progress + metrics */}
        <div className="flex items-center gap-4 flex-1">
          {/* Compact progress ring */}
          <div className="relative w-14 h-14 shrink-0">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
              <circle
                cx="28" cy="28" r="23" fill="none"
                strokeWidth="5" className="stroke-secondary"
              />
              <motion.circle
                cx="28" cy="28" r="23" fill="none"
                strokeWidth="5" strokeLinecap="round"
                className="stroke-foreground"
                strokeDasharray={`${(pct / 100) * 144.5} 144.5`}
                initial={{ strokeDasharray: "0 144.5" }}
                animate={{ strokeDasharray: `${(pct / 100) * 144.5} 144.5` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
              {pct}%
            </span>
          </div>

          {/* Inline metrics */}
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {language === "spanish" ? "Completado" : "Completed"}
              </p>
              <p className="text-sm font-bold text-foreground tabular-nums">
                {stats.overallCompletion.completedAssessments}/{stats.overallCompletion.totalAssessments}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {language === "spanish" ? "Última actividad" : "Last Activity"}
              </p>
              <p className="text-sm font-bold text-foreground">{lastActivity}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {language === "spanish" ? "Esta semana" : "This Week"}
              </p>
              <p className="text-sm font-bold text-foreground tabular-nums">
                {stats.recentActivity.eventsThisWeek} {language === "spanish" ? "eventos" : "events"}
              </p>
            </div>
          </div>
        </div>

        {/* Assessment pills */}
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {assessments.map((a) => {
            const done = a.status === "completed";
            const active = a.status === "in_progress";
            return (
              <div
                key={a.label}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border",
                  done
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : active
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-secondary text-muted-foreground border-border"
                )}
              >
                {done ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
                {a.label}
                {a.detail && (
                  <span className="opacity-70">{a.detail}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TimelineStats;
