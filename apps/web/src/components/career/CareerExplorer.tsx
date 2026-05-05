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
import { Compass, SearchX, Lock, CheckCircle2, Circle, ArrowRight } from "lucide-react";
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
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const { data: assessmentProgress, isLoading: assessmentLoading } = useAssessmentProgress(user?.id || "");
  const allAssessmentsComplete =
    assessmentProgress?.overallCompletion?.completedAssessments === 3;

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

  // Treat as loading if TIMS is loading, or if results came back but all scores are 0 (scoring not complete)
  const allZeroScores = timsCareerList && timsCareerList.length > 0 && timsCareerList.every((c) => c.totalScore === 0);
  const isLoading = timsLoading || listLoading || allZeroScores;

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

  if (!assessmentLoading && !allAssessmentsComplete) {
    const pcaStatus = assessmentProgress?.pcaAssessment?.status || "not_started";
    const milStatus = assessmentProgress?.milAssessment?.status || "not_started";
    const evalStatus = assessmentProgress?.evaluationAssessment?.status || "not_started";

    const assessments = [
      {
        name: t("career.gate.pca", "PCA Assessment"),
        description: t("career.gate.pcaDesc", "Discover your DISC personality profile"),
        status: pcaStatus,
        href: "/dashboard/assessments/pca",
      },
      {
        name: t("career.gate.lia", "LIA Assessment"),
        description: t("career.gate.liaDesc", "Measure your cognitive abilities across 5 dimensions"),
        status: milStatus,
        href: "/dashboard/assessments/mil",
      },
      {
        name: t("career.gate.eval", "360° Evaluation"),
        description: t("career.gate.evalDesc", "Gather feedback from peers, parents, and teachers"),
        status: evalStatus,
        href: "/dashboard/assessments/evaluation",
      },
    ];

    const completedCount = assessments.filter((a) => a.status === "completed").length;

    return (
      <div className="space-y-6 max-w-4xl mx-auto py-8">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200/30">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {t("career.gate.title", "Complete Your Assessments")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto leading-relaxed">
            {t("career.gate.subtitle", "Finish all 3 assessments to unlock personalized career matches tailored to your unique profile.")}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
          <span>{completedCount}/3 {t("career.gate.completed", "completed")}</span>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-8 h-2 rounded-full transition-colors ${
                  i < completedCount ? "bg-emerald-500" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Assessment checklist */}
        <div className="space-y-3">
          {assessments.map((assessment) => {
            const isComplete = assessment.status === "completed";
            const isInProgress = assessment.status === "in_progress";

            return (
              <Link
                key={assessment.name}
                href={assessment.href}
                className={`flex items-center gap-4 p-5 rounded-2xl border transition-all duration-200 ${
                  isComplete
                    ? "bg-emerald-50/50 border-emerald-200/60"
                    : "bg-card border-border hover:border-primary/30 hover:shadow-sm"
                }`}
              >
                <div className="shrink-0">
                  {isComplete ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  ) : (
                    <Circle className={`w-6 h-6 ${isInProgress ? "text-amber-400" : "text-muted-foreground/30"}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-semibold ${isComplete ? "text-emerald-700" : "text-foreground"}`}>
                    {assessment.name}
                    {isInProgress && (
                      <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                        {t("career.gate.inProgress", "In Progress")}
                      </span>
                    )}
                  </h3>
                  <p className={`text-xs mt-0.5 ${isComplete ? "text-emerald-600/70" : "text-muted-foreground"}`}>
                    {assessment.description}
                  </p>
                </div>
                {!isComplete && (
                  <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                )}
              </Link>
            );
          })}
        </div>

        {/* CTA */}
        {completedCount < 3 && (() => {
          const next = assessments.find((a) => a.status !== "completed");
          return next ? (
            <div className="text-center pt-2">
              <Link
                href={next.href}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                {next.status === "in_progress"
                  ? t("career.gate.continue", "Continue Assessment")
                  : t("career.gate.startNext", "Start Next Assessment")}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : null;
        })()}
      </div>
    );
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
        </div>
      </div>

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
