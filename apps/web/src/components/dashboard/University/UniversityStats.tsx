"use client";

import React from "react";
import { motion } from "motion/react";
import { UniversityStatsProps } from "@/types/university";
import { TrendingUp, Globe2, GraduationCap, MapPin, Award } from "lucide-react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label: string;
  value: string | number;
  subValue: string;
  icon: React.ElementType;
  delay?: number;
  accent?: string;
}

function StatCard({ label, value, subValue, icon: Icon, delay = 0, accent }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <div className="flex flex-col justify-between rounded-xl bg-[var(--admin-bg-card)] border border-[var(--admin-border-default)] p-5 hover:border-[var(--admin-border-hover)] transition-colors">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-lg bg-[var(--admin-bg-icon-box)] flex items-center justify-center">
            <Icon className={`h-4 w-4 ${accent || "text-[var(--admin-font-tertiary)]"}`} strokeWidth={1.8} />
          </div>
          <span className="text-xs font-medium text-[var(--admin-font-tertiary)] uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-2xl font-bold text-[var(--admin-font-primary)] tracking-tight truncate" title={String(value)}>
          {value}
        </div>
        <p className="text-[11px] text-[var(--admin-font-tertiary)] mt-1 truncate" title={subValue}>
          {subValue}
        </p>
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
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const topField = stats.topRecommendedFields?.[0];
  const topCountry = Object.entries(stats.byCountry || {})[0]?.[0];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label={t("Matches", "Coincidencias")}
        value={stats.overview?.totalMatches ?? 0}
        subValue={t("Universities matching your profile", "Universidades según tu perfil")}
        icon={Globe2}
        delay={0}
        accent="text-blue-400"
      />
      <StatCard
        label={t("Top Score", "Mejor Puntaje")}
        value={`${(stats.overview?.topMatchScore ?? 0).toFixed(0)}%`}
        subValue={t("Highest recommendation score", "Puntaje más alto")}
        icon={Award}
        delay={0.05}
        accent="text-emerald-400"
      />
      <StatCard
        label={t("Best Field", "Mejor Área")}
        value={topField?.field || "—"}
        subValue={t("Top matching field of study", "Mejor campo de estudio")}
        icon={GraduationCap}
        delay={0.1}
        accent="text-purple-400"
      />
      <StatCard
        label={t("Top Region", "Mejor Región")}
        value={topCountry || "—"}
        subValue={t("Most matches found here", "Más coincidencias aquí")}
        icon={MapPin}
        delay={0.15}
        accent="text-amber-400"
      />
    </div>
  );
}

export default UniversityStats;
