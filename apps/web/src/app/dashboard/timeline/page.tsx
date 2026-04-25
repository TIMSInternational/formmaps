"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { History, RefreshCw, ArrowLeft, Calendar, Filter, Sparkles } from "lucide-react";
import Link from "next/link";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTimeline } from "@/hooks/useTimelineQueries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    // Filter state
    filters,
    updateFilters,
    resetFilters,
    hasActiveFilters,
    // Events data
    events,
    summary,
    isLoading,
    isError,
    error,
    refetch,
    // Stats data
    stats,
    isStatsLoading,
    // Export
    exportData,
    isExporting,
  } = useTimeline(user?.id || "");

  return (
    <div className="relative">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-[0.02] pointer-events-none" />
      
      <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                    {language === "spanish"
                      ? "Tu Viaje de Progreso"
                      : "Your Progress Journey"}
                  </h1>
                  <p className="text-gray-500 mt-1 text-base font-medium">
                    {language === "spanish"
                      ? "Visualiza tus logros y camino de aprendizaje"
                      : "Visualize your achievements and learning path"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isLoading}
                    className="bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors h-9 px-3 rounded-lg shadow-sm"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 mr-2 ${isLoading ? "animate-spin" : ""}`}
                    />
                    {language === "spanish" ? "Actualizar" : "Refresh"}
                  </Button>
                  <TimelineExport
                    events={events}
                    filters={filters}
                    onExport={exportData}
                    isExporting={isExporting}
                  />
                </div>
              </div>
            </motion.div>

            {/* Stats Section */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-10"
            >
              <TimelineStats stats={stats} isLoading={isStatsLoading} />
            </motion.div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Filters Sidebar */}
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="lg:col-span-3"
              >
                <div className="bg-white rounded-xl border border-gray-100 sticky top-6 overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                    <div className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
                      <Filter className="w-3.5 h-3.5 text-gray-500" />
                      {language === "spanish" ? "Filtros" : "Filters"}
                    </div>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetFilters}
                        className="text-[10px] h-6 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        {language === "spanish" ? "Limpiar" : "Clear"}
                      </Button>
                    )}
                  </div>
                  <div className="p-4">
                    <TimelineFilters
                      filters={filters}
                      onFiltersChange={updateFilters}
                    />
                  </div>
                </div>
              </motion.div>

              {/* Timeline Content */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="lg:col-span-9"
              >
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden min-h-[600px] shadow-sm">
                  <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                        {language === "spanish" ? "Línea de Tiempo" : "Timeline Events"}
                      </h2>
                      {summary && (
                        <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                          {summary.totalEvents}
                        </span>
                      )}
                    </div>
                    
                    {/* Summary badges */}
                    {summary && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-full font-bold uppercase tracking-wide">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {summary.byStatus.completed}{" "}
                          {language === "spanish" ? "completados" : "completed"}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-bold uppercase tracking-wide">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          {summary.byStatus.in_progress}{" "}
                          {language === "spanish" ? "en progreso" : "in progress"}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-6">
                    {isError ? (
                      <div className="text-center py-16">
                        <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
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
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                          {t('dashboard.timelineErrorTitle')}
                        </h3>
                        <p className="text-sm text-gray-500 mb-4 max-w-xs mx-auto">
                          {error?.message || t('dashboard.timelineErrorMessage')}
                        </p>
                        <Button onClick={() => refetch()} variant="outline" size="sm">
                          {t('common.tryAgain')}
                        </Button>
                      </div>
                    ) : (
                      <TimelineView events={events} isLoading={isLoading} />
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
      </main>
    </div>
  );
}
