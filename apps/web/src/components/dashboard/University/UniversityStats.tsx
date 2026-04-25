"use client";

import React from "react";
import { motion } from "motion/react";
import { UniversityStatsProps } from "@/types/university";
import { TrendingUp, Globe2, GraduationCap, MapPin, Award } from "lucide-react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label: string;
  value: string | number;
  subValue: string;
  icon: React.ElementType;
  delay?: number;
  trend?: string;
}

function StatCard({ label, value, subValue, icon: Icon, delay = 0, trend }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="h-full"
    >
      <div className="h-full flex flex-col justify-between rounded-xl bg-white p-6 border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all duration-300 group">
        <div className="flex items-start justify-between mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          </div>
          {trend && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-wide">
              <TrendingUp className="w-3 h-3" />
              {trend}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900 tracking-tight truncate" title={String(value)}>
            {value}
          </p>
          <p className="text-xs text-gray-400 mt-1 font-medium truncate" title={subValue}>
            {subValue}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export function UniversityStats({ stats, isLoading }: UniversityStatsProps) {
  const { language } = useGlobalStore();
  const t = (en: string, es: string) => (language === "spanish" ? es : en);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const topField = stats.topRecommendedFields[0];
  const topCountry = Object.entries(stats.byCountry)[0]?.[0];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label={t("Total Matches", "Total Coincidencias")}
        value={stats.overview.totalMatches}
        subValue={t("Universities fitting your profile", "Universidades según tu perfil")}
        icon={Globe2}
        delay={0}
      />

      <StatCard
        label={t("Top Match Score", "Mejor Puntuación")}
        value={`${stats.overview.topMatchScore}%`}
        subValue={t("Highest recommendation score", "Puntaje más alto")}
        icon={Award}
        delay={0.1}
        trend={t("High Fit", "Alta")}
      />

      <StatCard
        label={t("Top Focus Area", "Área Principal")}
        value={topField?.field || t("N/A", "N/A")}
        subValue={t("Best matching field", "Mejor campo de estudio")}
        icon={GraduationCap}
        delay={0.2}
      />

      <StatCard
        label={t("Top Region", "Mejor Región")}
        value={topCountry || "-"}
        subValue={t("Most matches found here", "Más coincidencias aquí")}
        icon={MapPin}
        delay={0.3}
      />
    </div>
  );
}

export default UniversityStats;
