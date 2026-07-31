"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { useSearchParams, useRouter } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  useUniversityList,
  useUniversityRecommendations,
  useUniversityStats,
  useUniversityFiltersOptions,
  useUniversityFavoriteMutation,
  useUniversityFavorites,
} from "@/hooks/useUniversityQueries";
import { University, UniversityFilters, UniversityRecommendation } from "@/types/university";
import UniversityCard from "@/components/dashboard/University/UniversityCard";
import UniversityFiltersPanel from "@/components/dashboard/University/UniversityFilters";
import { useSidePanel } from "@/components/side-panel/SidePanel";
import { UniversityDetailPanel } from "@/components/side-panel/UniversityDetailPanel";
import UniversityStats from "@/components/dashboard/University/UniversityStats";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Grid3X3,
  List,
  Compass,
  Star,
  GraduationCap,
  Filter,
  Lock,
  CheckCircle2,
  Circle,
  ArrowRight,
} from "lucide-react";
import { useAssessmentProgress } from "@/hooks/useAssessmentQueries";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { ActiveFilterPills, type FilterPill } from "@/components/filters/ActiveFilterPills";
import { CompareBar } from "@/components/compare/CompareBar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export default function UniversityPage() {
  const { user, language } = useGlobalStore();
  const userId = user?.id ?? "mock-user";
  const searchParams = useSearchParams();
  const router = useRouter();

  // Assessment gate — same as Career Paths Explorer. percentageComplete (server-driven,
  // accounts for legacyUnlockGrandfathered) rather than a raw completedAssessments/totalAssessments compare.
  const { data: assessmentProgress, isLoading: assessmentLoading } = useAssessmentProgress(userId);
  const allAssessmentsComplete = assessmentProgress?.overallCompletion?.percentageComplete === 100;

  // Initialize filters from URL params
  const [filters, setFiltersState] = React.useState<UniversityFilters>(() => {
    const initial: UniversityFilters = {};
    const search = searchParams.get("search");
    const countries = searchParams.get("countries");
    const degrees = searchParams.get("degrees");
    const fields = searchParams.get("fields");
    if (search) initial.search = search;
    if (countries) initial.countries = countries.split(",");
    if (degrees) initial.degrees = degrees.split(",") as UniversityFilters["degrees"];
    if (fields) initial.fields = fields.split(",") as UniversityFilters["fields"];
    return initial;
  });

  // Sync filters to URL
  const setFilters = useCallback((next: UniversityFilters) => {
    setFiltersState(next);
    const params = new URLSearchParams();
    if (next.search) params.set("search", next.search);
    if (next.countries?.length) params.set("countries", next.countries.join(","));
    if (next.degrees?.length) params.set("degrees", next.degrees.join(","));
    if (next.fields?.length) params.set("fields", next.fields.join(","));
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/dashboard/university", { scroll: false });
  }, [router]);

  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = React.useState("recommended");
  const { openPanel } = useSidePanel();

  const listQuery = useUniversityList(filters, 1, 20);
  const recoQuery = useUniversityRecommendations(userId);
  const statsQuery = useUniversityStats(userId);
  const filterOptionsQuery = useUniversityFiltersOptions();
  const favoritesQuery = useUniversityFavorites(userId);
  const favoriteMutation = useUniversityFavoriteMutation();

  const favoritesSet = new Set(
    (Array.isArray(favoritesQuery.data) ? favoritesQuery.data : []).map((f) => f.universityId)
  );

  const handleFavoriteToggle = (universityId: string) => {
    const isFavorite = favoritesSet.has(universityId);
    favoriteMutation.mutate({
      universityId,
      action: isFavorite ? "unsave" : "save",
    });
  };

  const t = (en: string, es: string) => (language === "spanish" ? es : en);

  const hasRecommendations = !!(
    recoQuery.data?.recommendations?.length || recoQuery.data?.universities?.length
  );
  const recoUniversities = recoQuery.data?.recommendations?.map((r: UniversityRecommendation) => r.university || r)
    || recoQuery.data?.universities
    || [];

  const universities = (
    activeTab === "recommended" && recoQuery.data
      ? recoUniversities
      : listQuery.data?.universities
  ) as University[] | undefined;

  const recommendationMap = new Map<string, UniversityRecommendation>(
    (recoQuery.data?.recommendations || []).map((r) => [
      r.university.id, r
    ] as [string, UniversityRecommendation])
  );

  const handleViewDetails = React.useCallback(
    (university: University) => {
      const rec = recommendationMap.get(university.id);
      openPanel({
        title: university.name,
        content: (
          <UniversityDetailPanel
            university={university}
            matchScore={rec?.matchScore}
            matchBreakdown={rec?.matchBreakdown}
            matchReasons={rec?.matchReasonsArray?.[language === "spanish" ? "es" : "en"]}
            recommendedPrograms={rec?.recommendedPrograms}
          />
        ),
      });
    },
    [openPanel, recommendationMap, language],
  );

  const activeFilterCount =
    (filters.countries?.length || 0) +
    (filters.degrees?.length || 0) +
    (filters.fields?.length || 0) +
    (filters.search ? 1 : 0) +
    (filters.hasFinancialAid ? 1 : 0) +
    (filters.hasHousing ? 1 : 0);

  // Assessment gate — show lock screen if not all assessments complete
  if (!assessmentLoading && !allAssessmentsComplete) {
    const pcaStatus = assessmentProgress?.pcaAssessment?.status || "not_started";
    const milStatus = assessmentProgress?.milAssessment?.status || "not_started";
    const evalStatus = assessmentProgress?.evaluationAssessment?.status || "not_started";
    const personalityStatus = assessmentProgress?.personalityAssessment?.status || "not_started";
    const gateAssessments = [
      { name: "PCA Assessment", description: "Discover your DISC personality profile", status: pcaStatus, href: "/dashboard/assessments/pca" },
      { name: "LIA Assessment", description: "Measure your cognitive abilities across 5 dimensions", status: milStatus, href: "/dashboard/assessments/lia" },
      { name: "360° Evaluation", description: "Gather feedback from peers, parents, and teachers", status: evalStatus, href: "/dashboard/assessments/evaluation" },
      { name: "Personality Assessment", description: "Resolve your 4-letter personality type", status: personalityStatus, href: "/dashboard/assessments/personality" },
    ];
    const completedCount = gateAssessments.filter((a) => a.status === "completed").length;

    return (
      <div className="space-y-6 max-w-4xl mx-auto py-8">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200/30">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Complete Your Assessments</h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto leading-relaxed">
            Finish all 4 assessments to unlock personalized university recommendations based on your profile, competencies, and preferences.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
          <span>{completedCount}/4 completed</span>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`w-8 h-2 rounded-full transition-colors ${i < completedCount ? "bg-emerald-500" : "bg-muted"}`} />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {gateAssessments.map((assessment) => {
            const isComplete = assessment.status === "completed";
            const isInProgress = assessment.status === "in_progress";
            return (
              <Link key={assessment.name} href={assessment.href}
                className={`flex items-center gap-4 p-5 rounded-2xl border transition-all duration-200 ${
                  isComplete ? "bg-emerald-50/50 border-emerald-200/60" : "bg-card border-border hover:border-primary/30 hover:shadow-sm"
                }`}>
                <div className="shrink-0">
                  {isComplete ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <Circle className={`w-6 h-6 ${isInProgress ? "text-amber-400" : "text-muted-foreground/30"}`} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-semibold ${isComplete ? "text-emerald-700" : "text-foreground"}`}>
                    {assessment.name}
                    {isInProgress && <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">In Progress</span>}
                  </h3>
                  <p className={`text-xs mt-0.5 ${isComplete ? "text-emerald-600/70" : "text-muted-foreground"}`}>{assessment.description}</p>
                </div>
                {!isComplete && <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
              </Link>
            );
          })}
        </div>
        {completedCount < 4 && (() => {
          const next = gateAssessments.find((a) => a.status !== "completed");
          return next ? (
            <div className="text-center pt-2">
              <Link href={next.href} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm">
                {next.status === "in_progress" ? "Continue Assessment" : "Start Next Assessment"}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : null;
        })()}
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-5 sm:space-y-8 mb-6 sm:mb-10"
      >
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
            {t("University Finder", "Buscador de Universidades")}
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
            {t(
              "Find Your Perfect Match",
              "Encuentra tu Universidad Ideal"
            )}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            {t(
              "Discover universities tailored to your profile, assessments, and career aspirations.",
              "Descubre universidades adaptadas a tu perfil, evaluaciones y aspiraciones profesionales."
            )}
          </p>
          <p className="max-w-2xl text-[11px] text-muted-foreground/70 mt-1">
            {t(
              "Match and admission estimates are based on your assessment data and are for informational guidance only — not a guarantee of admission and not a substitute for professional counseling.",
              "Las estimaciones de coincidencia y admisión se basan en tus datos de evaluación y son solo orientativas — no garantizan la admisión ni sustituyen la asesoría profesional."
            )}
          </p>
        </div>

        <UniversityStats
          stats={statsQuery.data}
          isLoading={statsQuery.isLoading && !statsQuery.error}
        />
      </motion.div>

      {/* Main content */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-6"
      >
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v)}
              className="w-full sm:w-auto"
            >
              <TabsList className="bg-card border border-border p-1 h-auto rounded-lg w-full sm:w-auto">
                <TabsTrigger
                  value="recommended"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs font-medium px-3 py-1.5 data-[state=active]:bg-secondary data-[state=active]:text-foreground rounded-md transition-all"
                >
                  <Compass className="h-3.5 w-3.5" />
                  {t("Recommended", "Recomendadas")}
                </TabsTrigger>
                <TabsTrigger
                  value="all"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs font-medium px-3 py-1.5 data-[state=active]:bg-secondary data-[state=active]:text-foreground rounded-md transition-all"
                >
                  <Star className="h-3.5 w-3.5" />
                  {t("All Universities", "Todas")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Filter Button */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 bg-card border-border gap-2"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {t("Filters", "Filtros")}
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2E9098] text-[10px] text-white font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px] overflow-y-auto">
                <SheetHeader className="mb-4">
                  <SheetTitle>{t("Filters", "Filtros")}</SheetTitle>
                </SheetHeader>
                <UniversityFiltersPanel
                  filters={filters}
                  onFiltersChange={setFilters}
                  filterOptions={filterOptionsQuery.data}
                  isLoading={filterOptionsQuery.isLoading}
                />
              </SheetContent>
            </Sheet>
          </div>

          <div className="hidden sm:flex items-center gap-1 bg-card border border-border p-1 rounded-lg">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 w-7 p-0 rounded-md ${viewMode === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 w-7 p-0 rounded-md ${viewMode === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Active filter pills */}
        {(() => {
          const pills: FilterPill[] = [];
          if (filters.search) pills.push({ key: "search", label: "Search", value: filters.search });
          if (filters.countries?.length) pills.push({ key: "countries", label: "Countries", value: filters.countries.join(", ") });
          if (filters.degrees?.length) pills.push({ key: "degrees", label: "Degrees", value: filters.degrees.join(", ") });
          if (filters.fields?.length) pills.push({ key: "fields", label: "Fields", value: filters.fields.join(", ") });
          if (filters.hasFinancialAid) pills.push({ key: "hasFinancialAid", label: "Financial Aid", value: "Yes" });
          if (filters.hasHousing) pills.push({ key: "hasHousing", label: "Housing", value: "Yes" });
          return (
            <ActiveFilterPills
              pills={pills}
              onRemove={(key) => setFilters({ ...filters, [key]: undefined })}
              onClearAll={() => setFilters({})}
            />
          );
        })()}

        <Tabs value={activeTab} className="space-y-6">
          <TabsContent value="recommended" className="space-y-6 mt-0">
            {/* Show empty state when no recommendations (not loading, or errored, or empty data) */}
            {!hasRecommendations && (!recoQuery.isLoading || recoQuery.error) && (
              <EmptyState
                type="not_started"
                title={t("Complete your assessments first", "Completa tus evaluaciones primero")}
                description={t(
                  "Take the PCA and MIL assessments to get personalized university recommendations based on your profile.",
                  "Completa las evaluaciones PCA y MIL para obtener recomendaciones personalizadas."
                )}
                icon={GraduationCap}
                actionLabel="Start Assessments"
                actionHref="/dashboard/assessments"
                secondaryLabel="Browse All Universities"
                onSecondary={() => setActiveTab("all")}
              />
            )}

            {recoQuery.isLoading && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[340px] w-full rounded-xl" />
                ))}
              </div>
            )}

            {!recoQuery.isLoading &&
              universities &&
              universities.length > 0 && (
                <div
                  className={
                    viewMode === "grid"
                      ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                      : "space-y-4"
                  }
                >
                  {universities.map((u) => {
                    const rec = recommendationMap.get(u.id);
                    return (
                      <UniversityCard
                        key={u.id}
                        university={u}
                        matchScore={rec?.matchScore || (u as University & { matchScore?: number }).matchScore}
                        matchReasons={
                          rec?.matchReasonsArray?.[language === "spanish" ? "es" : "en"]
                          || (u as University & { matchReasons?: string[] }).matchReasons
                        }
                        onViewDetails={handleViewDetails}
                        variant="featured"
                        isFavorite={favoritesSet.has(u.id)}
                        onFavoriteToggle={handleFavoriteToggle}
                      />
                    );
                  })}
                </div>
              )}
          </TabsContent>

          <TabsContent value="all" className="space-y-6 mt-0">
            {listQuery.isLoading && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[340px] animate-pulse bg-secondary rounded-xl"
                  />
                ))}
              </div>
            )}
            {!listQuery.isLoading &&
              !listQuery.data?.universities?.length && (
                <EmptyState
                  type="no_results"
                  title={t("No universities found", "No se encontraron universidades")}
                  description={t(
                    "Try adjusting your filters to see more results.",
                    "Intenta ajustar tus filtros para ver más resultados."
                  )}
                  icon={GraduationCap}
                  actionLabel="Clear Filters"
                  onAction={() => setFilters({})}
                />
              )}
            {!listQuery.isLoading &&
              listQuery.data?.universities?.length && (
                <div
                  className={
                    viewMode === "grid"
                      ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                      : "space-y-4"
                  }
                >
                  {listQuery.data.universities.map((u) => (
                    <UniversityCard
                      key={u.id}
                      university={u}
                      onViewDetails={handleViewDetails}
                      isFavorite={favoritesSet.has(u.id)}
                      onFavoriteToggle={handleFavoriteToggle}
                    />
                  ))}
                </div>
              )}
          </TabsContent>
        </Tabs>
      </motion.section>

      <CompareBar
        getUniversity={(id) => {
          const all: University[] = [
            ...(recoQuery.data?.recommendations?.map((r) => r.university) ?? []),
            ...(recoQuery.data?.universities ?? []),
            ...(listQuery.data?.universities ?? []),
          ];
          return all.find((u) => u?.id === id);
        }}
        getRecommendation={(id) => recommendationMap.get(id)}
      />
    </div>
  );
}
