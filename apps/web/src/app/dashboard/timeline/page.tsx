"use client";

import React from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Filter } from "lucide-react";
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
    <div className="space-y-6">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
        >
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
              Progress
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none mt-1">
              {language === "spanish"
                ? "Tu Viaje de Progreso"
                : "Your Progress Journey"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {language === "spanish"
                ? "Visualiza tus logros y camino de aprendizaje"
                : "Visualize your achievements and learning path"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-foreground hover:bg-border rounded-xl text-sm font-medium transition-colors border border-border"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
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

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <TimelineStats stats={stats} isLoading={isStatsLoading} />
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Filters Sidebar */}
            <div className="lg:col-span-3">
              <div className="dash-card sticky top-6 overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                    {language === "spanish" ? "Filtros" : "Filters"}
                  </div>
                  {hasActiveFilters && (
                    <button
                      onClick={resetFilters}
                      className="text-[10px] px-2 py-1 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
                    >
                      {language === "spanish" ? "Limpiar" : "Clear"}
                    </button>
                  )}
                </div>
                <div className="p-4">
                  <TimelineFilters
                    filters={filters}
                    onFiltersChange={updateFilters}
                  />
                </div>
              </div>
            </div>

            {/* Timeline Content */}
            <div className="lg:col-span-9">
              <div className="dash-card overflow-hidden min-h-[600px]">
                <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground tracking-tight">
                      {language === "spanish"
                        ? "Línea de Tiempo"
                        : "Timeline Events"}
                    </h2>
                    {summary && (
                      <span className="ml-1 px-2 py-0.5 rounded-full bg-secondary text-xs font-bold text-muted-foreground">
                        {summary.totalEvents}
                      </span>
                    )}
                  </div>

                  {summary && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-[10px] bg-emerald-500/10 text-emerald-700 px-2.5 py-1 rounded-full font-bold uppercase tracking-wide">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {summary.byStatus.completed}{" "}
                        {language === "spanish" ? "completados" : "completed"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[10px] bg-blue-500/10 text-blue-700 px-2.5 py-1 rounded-full font-bold uppercase tracking-wide">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        {summary.byStatus.in_progress}{" "}
                        {language === "spanish" ? "en progreso" : "in progress"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  {isError ? (
                    <div className="text-center py-16">
                      <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                        <svg
                          className="h-6 w-6 text-red-500"
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
                      <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
                        {error?.message ||
                          t("dashboard.timelineErrorMessage")}
                      </p>
                      <button
                        onClick={() => refetch()}
                        className="px-4 py-2 bg-secondary text-foreground hover:bg-border rounded-xl text-sm font-medium transition-colors border border-border"
                      >
                        {t("common.tryAgain")}
                      </button>
                    </div>
                  ) : (
                    <TimelineView events={events} isLoading={isLoading} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
    </div>
  );
}
