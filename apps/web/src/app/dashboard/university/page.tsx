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
import { University, UniversityFilters } from "@/types/university";
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
} from "lucide-react";
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

  // Initialize filters from URL params
  const [filters, setFiltersState] = React.useState<UniversityFilters>(() => {
    const initial: UniversityFilters = {};
    const search = searchParams.get("search");
    const countries = searchParams.get("countries");
    const degrees = searchParams.get("degrees");
    const fields = searchParams.get("fields");
    if (search) initial.search = search;
    if (countries) initial.countries = countries.split(",");
    if (degrees) initial.degrees = degrees.split(",") as any;
    if (fields) initial.fields = fields.split(",") as any;
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
    favoritesQuery.data?.map((f) => f.universityId) ?? []
  );

  const handleFavoriteToggle = (universityId: string) => {
    const isFavorite = favoritesSet.has(universityId);
    favoriteMutation.mutate({
      universityId,
      action: isFavorite ? "unsave" : "save",
    });
  };

  const t = (en: string, es: string) => (language === "spanish" ? es : en);

  const recoUniversities = recoQuery.data?.recommendations?.map((r: any) => r.university || r)
    || recoQuery.data?.universities
    || [];

  const universities = (
    activeTab === "recommended" && recoQuery.data
      ? recoUniversities
      : listQuery.data?.universities
  ) as University[] | undefined;

  const recommendationMap = new Map(
    (recoQuery.data?.recommendations || []).map((r: any) => [r.university?.id || r.id, r])
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
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white font-bold">
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
            {(!recoQuery.data?.recommendations?.length) && (!recoQuery.isLoading || recoQuery.error) && (
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
                        matchScore={rec?.matchScore}
                        matchReasons={
                          rec?.matchReasonsArray?.[
                          language === "spanish" ? "es" : "en"
                          ]
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
          const all = [
            ...(recoQuery.data?.recommendations?.map((r) => r.university) ?? []),
            ...(listQuery.data?.universities ?? []),
          ];
          return all.find((u) => u.id === id);
        }}
        getRecommendation={(id) => recommendationMap.get(id)}
      />
    </div>
  );
}
