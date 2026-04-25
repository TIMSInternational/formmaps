"use client";

import React from "react";
import { motion } from "motion/react";
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  Activity,
  ClipboardCheck,
  Brain,
  Users,
  BookOpen,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { TimelineStats as TimelineStatsType } from "@/types/timeline";
import { useGlobalStore } from "@/store/useGlobalStore";
import { formatDistanceToNow } from "date-fns";
import { es, enUS } from "date-fns/locale";

interface TimelineStatsProps {
  stats?: TimelineStatsType;
  isLoading?: boolean;
}

/**
 * Stat card component
 */
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  delay?: number;
  trend?: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  delay = 0,
  trend,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className="h-full"
    >
      <div className="h-full flex flex-col justify-between rounded-xl bg-white p-6 border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all duration-300 group">
        <div className="flex items-start justify-between mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors" aria-hidden="true">
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          </div>
          {trend && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-wide">
              <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
              {trend}
              <span className="sr-only">increase</span>
            </div>
          )}
        </div>
        
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
          {subValue && (
            <p className="text-xs text-gray-400 mt-1 font-medium">
              {subValue}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Progress ring component
 */
function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div 
      className="relative flex items-center justify-center" 
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Overall Progress"
    >
      <svg width={size} height={size} className="transform -rotate-90" aria-hidden="true">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-100"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          strokeLinecap="round"
          className="text-gray-900"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-bold text-gray-900 tracking-tight" aria-hidden="true">{progress}%</span>
      </div>
    </div>
  );
}

/**
 * Assessment breakdown item
 */
interface BreakdownItemProps {
  icon: React.ElementType;
  label: string;
  status: string;
  detail: string;
  isCompleted: boolean;
  delay?: number;
}

function BreakdownItem({
  icon: Icon,
  label,
  status,
  detail,
  isCompleted,
  delay = 0,
}: BreakdownItemProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, ease: "easeOut" }}
      className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors group cursor-default"
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors border",
          isCompleted 
            ? "bg-emerald-50 border-emerald-100 text-emerald-600" 
            : "bg-white border-gray-100 text-gray-400 group-hover:border-gray-200 group-hover:text-gray-600"
        )}
        aria-hidden="true"
      >
        {isCompleted ? (
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
        ) : (
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <span
            className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide",
              isCompleted
                ? "bg-emerald-50 text-emerald-700"
                : status === "in_progress"
                ? "bg-blue-50 text-blue-700"
                : "bg-gray-50 text-gray-400"
            )}
          >
            {status === "completed" ? "Done" : status === "in_progress" ? "Active" : "Pending"}
          </span>
        </div>
        <p className="text-xs text-gray-500 truncate font-medium">{detail}</p>
      </div>
    </motion.div>
  );
}

/**
 * Main Timeline Stats Component
 */
export function TimelineStats({ stats, isLoading }: TimelineStatsProps) {
  const { language } = useGlobalStore();
  const locale = language === "spanish" ? es : enUS;

  if (isLoading) {
    return <TimelineStatsSkeleton />;
  }

  if (!stats) {
    return null;
  }

  const lastActivity = stats.recentActivity.lastActivityDate
    ? formatDistanceToNow(new Date(stats.recentActivity.lastActivityDate), {
        addSuffix: true,
        locale,
      })
    : language === "spanish"
    ? "Sin actividad"
    : "No activity";

  return (
    <div className="space-y-6">
      {/* Top Stats Row - Uniform Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label={
            language === "spanish" ? "Progreso General" : "Overall Progress"
          }
          value={`${stats.overallCompletion.percentage}%`}
          subValue={`${stats.overallCompletion.completedAssessments}/${
            stats.overallCompletion.totalAssessments
          } ${language === "spanish" ? "evaluaciones" : "assessments"}`}
          delay={0}
          trend="+12%"
        />
        <StatCard
          icon={Activity}
          label={language === "spanish" ? "Última Actividad" : "Last Activity"}
          value={lastActivity}
          delay={0.1}
        />
        <StatCard
          icon={Clock}
          label={language === "spanish" ? "Esta Semana" : "This Week"}
          value={stats.recentActivity.eventsThisWeek}
          subValue={language === "spanish" ? "eventos nuevos" : "new events"}
          delay={0.2}
        />
        <StatCard
          icon={CheckCircle2}
          label={language === "spanish" ? "Este Mes" : "This Month"}
          value={stats.recentActivity.eventsThisMonth}
          subValue={language === "spanish" ? "eventos totales" : "total events"}
          delay={0.3}
        />
      </div>

      {/* Assessment Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4, ease: "easeOut" }}
      >
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-8 items-center">
            {/* Progress Ring Section */}
            <div className="flex flex-col items-center justify-center gap-3 lg:w-1/4">
              <ProgressRing progress={stats.overallCompletion.percentage} size={140} />
              <div className="text-center">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                  {language === "spanish" ? "Estado" : "Status"}
                </h3>
                <p className="text-xs text-gray-500 mt-1 font-medium">
                  {language === "spanish" 
                    ? "En camino" 
                    : "On track"}
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px h-40 bg-gray-100" />

            {/* Breakdown List */}
            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              <BreakdownItem
                icon={ClipboardCheck}
                label="PCA"
                status={stats.assessmentBreakdown.pca.status}
                detail={
                  stats.assessmentBreakdown.pca.score
                    ? `${language === "spanish" ? "Puntuación" : "Score"}: ${
                        stats.assessmentBreakdown.pca.score
                      }%`
                    : language === "spanish"
                    ? "Análisis de Competencias"
                    : "Competence Analysis"
                }
                isCompleted={
                  stats.assessmentBreakdown.pca.status === "completed"
                }
                delay={0.5}
              />
              <BreakdownItem
                icon={Brain}
                label="LIA"
                status={stats.assessmentBreakdown.mil.status}
                detail={`${stats.assessmentBreakdown.mil.completedSubtests}/${
                  stats.assessmentBreakdown.mil.totalSubtests
                } subtests${
                  stats.assessmentBreakdown.mil.averageScore
                    ? ` • ${stats.assessmentBreakdown.mil.averageScore.toFixed(
                        0
                      )}% avg`
                    : ""
                }`}
                isCompleted={
                  stats.assessmentBreakdown.mil.status === "completed"
                }
                delay={0.6}
              />
              <BreakdownItem
                icon={Users}
                label="360°"
                status={stats.assessmentBreakdown.evaluation.status}
                detail={`${
                  stats.assessmentBreakdown.evaluation.completedEvaluations
                }/${stats.assessmentBreakdown.evaluation.totalEvaluators} ${
                  language === "spanish" ? "evaluaciones" : "evaluations"
                }`}
                isCompleted={
                  stats.assessmentBreakdown.evaluation.status === "completed"
                }
                delay={0.7}
              />
              <BreakdownItem
                icon={BookOpen}
                label={language === "spanish" ? "Cursos" : "Courses"}
                status={
                  stats.assessmentBreakdown.courses.completed > 0
                    ? "in_progress"
                    : "not_started"
                }
                detail={`${stats.assessmentBreakdown.courses.completed} ${
                  language === "spanish" ? "completados" : "completed"
                } • ${stats.assessmentBreakdown.courses.inProgress} ${
                  language === "spanish" ? "en progreso" : "in progress"
                }`}
                isCompleted={stats.assessmentBreakdown.courses.completed > 0}
                delay={0.8}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Loading skeleton
 */
function TimelineStatsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="h-56 bg-gray-100 rounded-xl" />
    </div>
  );
}

export default TimelineStats;
