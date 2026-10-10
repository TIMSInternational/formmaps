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
import { AssessmentGate } from "@/components/assessments/AssessmentGate";
import { formatAssessmentList } from "@/lib/assessments";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { ActiveFilterPills, type FilterPill } from "@/components/filters/ActiveFilterPills";
import { useSidePanel } from "@/components/side-panel/SidePanel";
import { CareerDetailPanel } from "@/components/side-panel/CareerDetailPanel";
import type { CareerRole } from "@/types/career";
import { useAssessmentProgress } from "@/hooks/useAssessmentQueries";
import { useGlobalStore } from "@/store/useGlobalStore";
import Link from "next/link";

const MAX_CAREERS = 10;

export default function CareerExplorer() {
  const { t, i18n } = useTranslation();
  const { user } = useGlobalStore();
  const { data: assessmentProgress, isLoading: assessmentLoading } = useAssessmentProgress(user?.id || "");
  // percentageComplete (not a raw completedAssessments/totalAssessments compare) is
  // deliberately used here — it's already server-driven and accounts for
  // legacyUnlockGrandfathered, where completedAssessments can be 3-of-4 (Personality
  // not done) while the student is still genuinely unlocked.
  const allAssessmentsComplete =
    assessmentProgress?.overallCompletion?.percentageComplete === 100;

  const [filters, setFilters] = useState<{
    search?: string;
    industry?: string;
    sort?: string;
  }>({});

  // Personality became a required 4th assessment (alongside PCA/LIA/360) on
  // 2026-07-30 — see personalityAssessment.gating and the required checklist below.
  const personalityStatus = assessmentProgress?.personalityAssessment?.status || "not_started";
  const personalityCompleted = personalityStatus === "completed";

  const { data: timsData, isLoading: timsLoading } = useTimsCareerScoring();
  // audit 2026-10-09 C16: the catalog endpoint takes no filter params (they were silently
  // dropped), so fetch it once and filter the loaded list client-side below.
  const { data: listData, isLoading: listLoading } = useCareerList();

  const { favorites, toggleFavorite } = useFavorites();
  const { openPanel } = useSidePanel();

  const handleViewCareer = React.useCallback((career: CareerRole) => {
    const title = (typeof career.title === "string" ? career.title : career.title?.["en"]) || "";
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

  const timsCareerList = timsData?.data?.careers;

  // audit 2026-10-09 C16: all-zero scores used to count as "loading" — nothing refetches, so the
  // student sat on a skeleton forever. It is a finished-but-empty result: show an empty state.
  const allZeroScores = !!timsCareerList && timsCareerList.length > 0 && timsCareerList.every((c) => c.totalScore === 0);
  const isLoading = timsLoading || listLoading;

  const fieldOf = (cluster?: string) => (cluster || "").replace(/_/g, " ").trim();
  const fieldOptions = React.useMemo(
    () => Array.from(new Set((timsCareerList || []).map((c) => fieldOf(c.cluster)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [timsCareerList],
  );

  const displayCareers = React.useMemo(() => {
    if (timsCareerList && timsCareerList.length > 0 && !allZeroScores) {
      const staticCareers = listData?.careers || [];
      const q = (filters.search || "").trim().toLowerCase();
      // Client-side filters over the full scored list, applied BEFORE taking the top N.
      const scored = timsCareerList.filter((sc) =>
        (!filters.industry || fieldOf(sc.cluster) === filters.industry) &&
        (!q || `${sc.programTitle} ${fieldOf(sc.cluster)}`.toLowerCase().includes(q)),
      );

      const list = scored.map((sc) => {
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
            en: `Career in ${(sc.cluster || "General").replace(/_/g, " ")} — ${Math.round(sc.totalScore)}% match based on your assessment profile.`,
            es: `Carrera en ${(sc.cluster || "General").replace(/_/g, " ")} — ${Math.round(sc.totalScore)}% de coincidencia basada en tu perfil.`,
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

      // Rank by match first so "Name (A-Z)" orders the student's top matches, not the alphabet.
      list.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
      const top = list.slice(0, MAX_CAREERS);
      if (filters.sort === "title") {
        const name = (c: (typeof top)[number]) => (typeof c.title === "string" ? c.title : c.title?.en) || "";
        top.sort((a, b) => name(a).localeCompare(name(b)));
      }
      return top;
    }

    if (!isLoading && !allZeroScores && listData?.careers) {
      return [...listData.careers].slice(0, MAX_CAREERS);
    }

    return [];
  }, [listData, timsCareerList, allZeroScores, isLoading, filters.search, filters.industry, filters.sort]);

  if (!assessmentLoading && !allAssessmentsComplete) {
    return <AssessmentGate progress={assessmentProgress} unlocks="careers" />;
  }

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
          <p className="text-[11px] text-muted-foreground/70 ml-0 sm:ml-[3.25rem] leading-relaxed">
            {t("career.explorer.disclaimer", "These match estimates are based on your assessment data and are for informational guidance only — not a guarantee of employment and not a substitute for professional career counseling.")}
          </p>
          {/* Reachable only for a legacyUnlockGrandfathered student (Personality is required for
              everyone else to have reached this unlocked view at all) — nudge to still complete it. */}
          {!personalityCompleted && (
            <Link
              href="/dashboard/assessments/personality"
              className="inline-flex items-center gap-1.5 ml-0 sm:ml-[3.25rem] w-fit text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-full transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t("career.personality.description", "Add your 4-letter personality type for even sharper career matches")}
              <span className="font-semibold">{t("career.personality.recommended", "Recommended")}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="shrink-0">
        <CareerFilters filters={filters} onChange={setFilters} fieldOptions={fieldOptions} />
      </div>

      {/* Active filter pills */}
      {(() => {
        const pills: FilterPill[] = [];
        if (filters.search) pills.push({ key: "search", label: "Search", value: filters.search });
        if (filters.industry) pills.push({ key: "industry", label: "Industry", value: filters.industry });
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
        allZeroScores ? (
          <EmptyState
            type="no_results"
            title={t("career.explorer.scoresPendingTitle")}
            description={t("career.explorer.scoresPendingDesc")}
          />
        ) : filters.search || filters.industry ? (
          <EmptyState
            type="no_results"
            title={t("career.explorer.noResults", "No careers match your filters")}
            description={t("career.explorer.noResultsFilterDesc", "Try adjusting your search or filter criteria to see more results.")}
            actionLabel={t("career.explorer.clearFilters")}
            onAction={() => setFilters({})}
          />
        ) : (
          <EmptyState
            type="not_started"
            title={t("career.explorer.noResults", "No careers found")}
            description={t("career.explorer.noResultsDesc", { list: formatAssessmentList(t, i18n.language) })}
            actionLabel="Start Assessments"
            actionHref="/dashboard/assessments"
          />
        )
      )}

      {!isLoading && displayCareers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 pb-6">
          {displayCareers.map((career, idx) => (
            <motion.div
              key={career.id || `career-${idx}`}
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
