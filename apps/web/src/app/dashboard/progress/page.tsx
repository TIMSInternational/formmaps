"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Target,
  Flag,
  CheckCircle2,
  Clock,
  ArrowLeft,
  BookOpen,
  Award,
  TrendingUp,
  Flame,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTimeline } from "@/hooks/useTimelineQueries";
import { usePCAData } from "@/hooks/usePCAData";
import { useMILData } from "@/hooks/useMILData";

export default function ProgressMilestonesPage() {
  const { t } = useTranslation();
  const { user, language } = useGlobalStore();
  const { events, summary, isLoading: timelineLoading } = useTimeline(user?.id || "");
  const { isCompleted: pcaCompleted } = usePCAData();
  const { isCompleted: milCompleted, getSubtestScores } = useMILData();

  // Derive real stats from timeline events
  const completedEvents = events?.filter((e: any) => e.status === "completed") || [];
  const inProgressEvents = events?.filter((e: any) => e.status === "in_progress") || [];
  const totalEvents = events?.length || 0;
  const milSubtests = getSubtestScores();

  const stats = {
    assessmentsCompleted: summary?.byStatus?.completed || completedEvents.length,
    inProgress: summary?.byStatus?.in_progress || inProgressEvents.length,
    totalEvents,
    milSubtestsDone: milSubtests.length,
  };

  // Build milestones from real data
  const milestones = [
    {
      id: "pca",
      title: language === "spanish" ? "PCA Completado" : "PCA Completed",
      description: language === "spanish" ? "Completa tu evaluación de personalidad" : "Complete your personality assessment",
      achieved: pcaCompleted,
      icon: Award,
    },
    {
      id: "mil",
      title: language === "spanish" ? "MIL Completado" : "MIL Completed",
      description: language === "spanish" ? "Completa los 5 subtests cognitivos" : "Complete all 5 cognitive subtests",
      achieved: milCompleted,
      progress: milCompleted ? 100 : Math.round((milSubtests.length / 5) * 100),
      icon: Target,
    },
    {
      id: "first-event",
      title: language === "spanish" ? "Primer Logro" : "First Achievement",
      description: language === "spanish" ? "Completa tu primera actividad" : "Complete your first activity",
      achieved: completedEvents.length > 0,
      icon: CheckCircle2,
    },
    {
      id: "five-events",
      title: language === "spanish" ? "5 Actividades" : "5 Activities Completed",
      description: language === "spanish" ? "Completa 5 actividades" : "Complete 5 activities in your journey",
      achieved: completedEvents.length >= 5,
      progress: completedEvents.length >= 5 ? 100 : Math.round((completedEvents.length / 5) * 100),
      icon: Flame,
    },
  ];

  // Recent activity from timeline events
  const recentActivity = (events || []).slice(0, 5).map((e: any, i: number) => ({
    id: e.id || i,
    title: e.title || e.type || "Activity",
    date: e.date ? new Date(e.date).toLocaleDateString() : "",
    status: e.status,
    type: e.type,
  }));

  const isLoading = timelineLoading;

  return (
    <div className="space-y-6">

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {language === "spanish" ? "Volver al Dashboard" : "Back to Dashboard"}
        </Link>

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-4"
        >
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
              {language === "spanish" ? "Tu Viaje" : "Your Journey"}
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none mt-1">
              {language === "spanish" ? "Progreso y Logros" : "Progress & Milestones"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {language === "spanish"
                ? "Rastrea tu viaje de aprendizaje y celebra tus logros"
                : "Track your learning journey and celebrate your achievements"}
            </p>
          </div>
          {!isLoading && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-emerald-200 bg-emerald-50 text-emerald-600">
                {stats.assessmentsCompleted} {language === "spanish" ? "completados" : "completed"}
              </span>
              <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-blue-200 bg-blue-50 text-blue-600">
                {stats.inProgress} {language === "spanish" ? "en progreso" : "in progress"}
              </span>
            </div>
          )}
        </motion.header>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {[
            { label: language === "spanish" ? "Completados" : "Completed", value: stats.assessmentsCompleted, icon: CheckCircle2, color: "text-emerald-600" },
            { label: language === "spanish" ? "En Progreso" : "In Progress", value: stats.inProgress, icon: Clock, color: "text-blue-600" },
            { label: language === "spanish" ? "Total Eventos" : "Total Events", value: stats.totalEvents, icon: BookOpen, color: "text-amber-600" },
            { label: language === "spanish" ? "MIL Subtests" : "MIL Subtests", value: `${stats.milSubtestsDone}/5`, icon: Award, color: "text-purple-600" },
          ].map((stat, i) => (
            <div key={i} className="dash-card p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              {isLoading ? (
                <div className="h-8 bg-secondary rounded animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              )}
            </div>
          ))}
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-5"
        >
          {/* Milestones */}
          <div className="lg:col-span-7">
            <div className="dash-card p-5">
              <div className="flex items-center gap-3 mb-5">
                <Target className="w-4 h-4 text-foreground" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {language === "spanish" ? "Hitos" : "Milestones"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {language === "spanish" ? "Rastrea tus logros" : "Track your learning achievements"}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {milestones.map((milestone, index) => (
                  <motion.div
                    key={milestone.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.08 }}
                    className={`p-3.5 rounded-xl border flex items-center gap-3.5 transition-colors ${
                      milestone.achieved
                        ? "bg-emerald-50/50 border-emerald-200"
                        : "bg-card border-border hover:border-foreground/20"
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${
                      milestone.achieved
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-secondary text-muted-foreground"
                    }`}>
                      <milestone.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-foreground">{milestone.title}</h4>
                      <p className="text-xs text-muted-foreground">{milestone.description}</p>
                      {!milestone.achieved && milestone.progress != null && milestone.progress < 100 && (
                        <div className="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-foreground/60 rounded-full transition-all"
                            style={{ width: `${milestone.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {milestone.achieved && (
                      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-emerald-200 bg-emerald-50 text-emerald-600 shrink-0">
                        {language === "spanish" ? "Logrado" : "Achieved"}
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-5">
            <div className="dash-card p-5 lg:sticky lg:top-8">
              <div className="flex items-center gap-3 mb-5">
                <TrendingUp className="w-4 h-4 text-foreground" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {language === "spanish" ? "Actividad Reciente" : "Recent Activity"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {language === "spanish" ? "Tu línea de tiempo" : "Your learning timeline"}
                  </p>
                </div>
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {language === "spanish" ? "Sin actividad reciente" : "No recent activity"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {language === "spanish"
                      ? "Completa evaluaciones para ver tu progreso"
                      : "Complete assessments to see your progress"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentActivity.map((activity: any, index: number) => (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.35 + index * 0.08 }}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary transition-colors"
                    >
                      <div className={`p-2 rounded-lg border ${
                        activity.status === "completed"
                          ? "text-emerald-600 bg-emerald-50 border-emerald-100"
                          : "text-blue-600 bg-blue-50 border-blue-100"
                      }`}>
                        {activity.status === "completed" ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <BookOpen className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-foreground truncate">{activity.title}</h4>
                        <p className="text-xs text-muted-foreground">{activity.date}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              <Link
                href="/dashboard/timeline"
                className="block w-full mt-5 py-2 text-center rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {language === "spanish" ? "Ver Toda la Actividad" : "View All Activity"}
              </Link>
            </div>
          </div>
        </motion.div>
    </div>
  );
}
