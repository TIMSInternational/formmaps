"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import CareerCard from "./CareerCard";
import SkeletonCareerCard from "./SkeletonCareerCard";
import { CareerFilters } from "./CareerFilters";
import { useCareerList } from "@/hooks/useCareerQueries";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";
import { useFavorites } from "@/hooks/useFavorites";
import { motion } from "motion/react";
import { Compass, SearchX, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { ActiveFilterPills, type FilterPill } from "@/components/filters/ActiveFilterPills";
import { useSidePanel } from "@/components/side-panel/SidePanel";
import { CareerDetailPanel } from "@/components/side-panel/CareerDetailPanel";
import type { CareerRole } from "@/types/career";

const MAX_CAREERS = 10;

export default function CareerExplorer() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<{
    search?: string;
    industry?: string;
    education?: string;
    sort?: string;
  }>({});

  const { data: timsData, isLoading: timsLoading } = useTimsCareerScoring();
  const { data: listData, isLoading: listLoading } = useCareerList({
    search: filters.search,
    industry: filters.industry,
    education: filters.education,
    sort: filters.sort as any,
  });

  const { favorites, toggleFavorite } = useFavorites();
  const { openPanel } = useSidePanel();

  const handleViewCareer = React.useCallback((career: CareerRole) => {
    const title = career.title["en"] || "";
    openPanel({
      title,
      content: (
        <CareerDetailPanel
          career={career}
          matchScore={career.matchScore}
          confidence={(career as any).confidence}
          aiInsight={(career as any).aiInsight}
          bridgingReasons={(career as any).bridgingReasons}
        />
      ),
    });
  }, [openPanel]);

  const isLoading = timsLoading || listLoading;

  const timsCareerList = timsData?.data?.careers;
  const profileSummary = timsData?.data?.profileSummary;

  const displayCareers = React.useMemo(() => {
    if (timsCareerList && timsCareerList.length > 0) {
      const staticCareers = listData?.careers || [];

      const list = timsCareerList.map((sc) => {
        const local = staticCareers.find(
          (c) => c.id === sc.programId || c.slug === sc.programId
        );

        if (local) {
          return {
            ...local,
            matchScore: sc.totalScore,
            confidence: sc.confidence,
            needsBridging: sc.needsBridging,
            bridgingReasons: sc.bridgingReasons,
            aiInsight: sc.aiInsight,
          };
        }

        return {
          id: sc.programId,
          familyId: sc.cluster || "unknown",
          slug: sc.programId.toLowerCase().replace(/\s+/g, "-"),
          title: { en: sc.programTitle, es: sc.programTitle },
          shortDescription: {
            en: sc.aiInsight || "Recommended career based on your profile analysis.",
            es: sc.aiInsight || "Carrera recomendada basada en tu análisis de perfil.",
          },
          matchScore: sc.totalScore,
          confidence: sc.confidence,
          needsBridging: sc.needsBridging,
          bridgingReasons: sc.bridgingReasons,
          aiInsight: sc.aiInsight,
          published: true,
          industries: [] as string[],
          skills: [] as any[],
          salaryRange: undefined,
          demandStats: undefined,
        };
      });

      const sort = filters.sort || "recommended";
      if (sort === "recommended" || sort === "match") {
        list.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
      }

      return list.slice(0, MAX_CAREERS);
    }

    if (!isLoading && listData?.careers) {
      return [...listData.careers].slice(0, MAX_CAREERS);
    }

    return [];
  }, [listData, timsCareerList, filters.sort, isLoading]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col gap-3 relative shrink-0">
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-200/20 shrink-0" aria-hidden="true">
              <Compass className="h-5 w-5 sm:h-6 sm:w-6 text-white" aria-hidden="true" />
            </div>
            {t("career.explorer.title", "Career Explorer")}
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base ml-0 sm:ml-[3.25rem] leading-relaxed">
            {t("career.explorer.subtitle", "Your top 10 career matches based on cognitive abilities, personality, and interests.")}
          </p>
        </div>
      </div>

      {profileSummary && (
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl p-4 shrink-0">
          <Sparkles className="h-5 w-5 text-indigo-500 mt-0.5 shrink-0" />
          <p className="text-sm text-indigo-700">{profileSummary}</p>
        </div>
      )}

      <div className="shrink-0">
        <CareerFilters filters={filters} onChange={setFilters} />
      </div>

      {/* Active filter pills */}
      {(() => {
        const pills: FilterPill[] = [];
        if (filters.search) pills.push({ key: "search", label: "Search", value: filters.search });
        if (filters.industry) pills.push({ key: "industry", label: "Industry", value: filters.industry });
        if (filters.education) pills.push({ key: "education", label: "Education", value: filters.education });
        if (filters.sort && filters.sort !== "recommended") pills.push({ key: "sort", label: "Sort", value: filters.sort });
        return (
          <ActiveFilterPills
            pills={pills}
            onRemove={(key) => setFilters({ ...filters, [key]: undefined })}
            onClearAll={() => setFilters({})}
          />
        );
      })()}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCareerCard key={i} />
          ))}
        </div>
      )}

      {!isLoading && displayCareers.length === 0 && (
        filters.search || filters.industry || filters.education ? (
          <EmptyState
            type="no_results"
            title={t("career.explorer.noResults", "No careers match your filters")}
            description={t("career.explorer.noResultsFilterDesc", "Try adjusting your search or filter criteria to see more results.")}
            actionLabel="Clear Filters"
            onAction={() => setFilters({})}
          />
        ) : (
          <EmptyState
            type="not_started"
            title={t("career.explorer.noResults", "No careers found")}
            description={t("career.explorer.noResultsDesc", "Complete your PCA and MIL assessments to receive personalized career recommendations.")}
            actionLabel="Start Assessments"
            actionHref="/dashboard/assessments"
          />
        )
      )}

      {!isLoading && displayCareers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 pb-6">
          {displayCareers.map((career, idx) => (
            <motion.div
              key={career.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className="h-full"
            >
              <CareerCard
                career={career}
                rank={idx + 1}
                isFavorite={favorites.includes(career.id)}
                onToggleFavorite={() => toggleFavorite(career.id)}
                onViewDetails={handleViewCareer}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
