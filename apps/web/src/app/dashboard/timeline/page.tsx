"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTimeline } from "@/hooks/useTimelineQueries";
import {
  TimelineView,
  TimelineFilters,
  TimelineExport,
  TimelineStats,
} from "@/components/dashboard/Timeline";

export default function TimelinePage() {
  const { user, language } = useGlobalStore();
  const { t } = useTranslation();
  const [showFilters, setShowFilters] = useState(false);

  const {
    filters,
    updateFilters,
    resetFilters,
    hasActiveFilters,
    events,
    summary,
    isLoading,
    isError,
    error,
    refetch,
    stats,
    isStatsLoading,
    exportData,
    isExporting,
  } = useTimeline(user?.id || "");

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-4">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {language === "spanish"
              ? "Tu Progreso"
              : "Your Progress"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {language === "spanish"
              ? "Visualiza tus logros y camino de aprendizaje"
              : "Visualize your achievements and learning path"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary text-foreground hover:bg-border rounded-xl text-xs font-medium transition-colors border border-border"
          >
            <RefreshCw
              className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`}
            />
            {language === "spanish" ? "Actualizar" : "Refresh"}
          </button>
          <TimelineExport
            events={events}
            filters={filters}
            onExport={exportData}
            isExporting={isExporting}
          />
        </div>
      </motion.header>

      {/* Compact Stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <TimelineStats stats={stats} isLoading={isStatsLoading} />
      </motion.div>

      {/* Timeline Content */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="dash-card overflow-hidden">
          {/* Timeline header with inline filter toggle */}
          <div className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">
                {language === "spanish" ? "Línea de Tiempo" : "Timeline"}
              </h2>
              {summary && (
                <span className="px-2 py-0.5 rounded-full bg-secondary text-[10px] font-bold text-muted-foreground tabular-nums">
                  {summary.totalEvents}
                </span>
              )}
              {summary && (
                <div className="hidden sm:flex items-center gap-1.5 ml-2">
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {summary.byStatus.completed}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-blue-700 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    {summary.byStatus.in_progress}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                hasActiveFilters
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <Filter className="w-3 h-3" />
              {language === "spanish" ? "Filtros" : "Filters"}
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-background" />
              )}
              {showFilters ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* Collapsible filters */}
          {showFilters && (
            <div className="p-4 border-b border-border bg-secondary/30">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <TimelineFilters
                    filters={filters}
                    onFiltersChange={updateFilters}
                  />
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-[10px] px-2 py-1 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors shrink-0"
                  >
                    {language === "spanish" ? "Limpiar" : "Clear"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Events */}
          <div className="p-4">
            {isError ? (
              <div className="text-center py-12">
                <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                  <svg
                    className="h-5 w-5 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">
                  {t("dashboard.timelineErrorTitle")}
                </h3>
                <p className="text-xs text-muted-foreground mb-3 max-w-xs mx-auto">
                  {error?.message || t("dashboard.timelineErrorMessage")}
                </p>
                <button
                  onClick={() => refetch()}
                  className="px-3 py-1.5 bg-secondary text-foreground hover:bg-border rounded-xl text-xs font-medium transition-colors border border-border"
                >
                  {t("common.tryAgain")}
                </button>
              </div>
            ) : (
              <TimelineView events={events} isLoading={isLoading} />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
