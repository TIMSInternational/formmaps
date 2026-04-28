"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
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
import UniversityDetailsModal from "@/components/dashboard/University/UniversityDetailsModal";
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
  const [filters, setFilters] = React.useState<UniversityFilters>({});
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [selectedUniversity, setSelectedUniversity] =
    React.useState<University | null>(null);
  const [activeTab, setActiveTab] = React.useState("recommended");

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

  const universities = (
    activeTab === "recommended" && recoQuery.data
      ? recoQuery.data.recommendations.map((r) => r.university)
      : listQuery.data?.universities
  ) as University[] | undefined;

  const recommendationMap = new Map(
    recoQuery.data?.recommendations.map((r) => [r.university.id, r]) ?? []
  );

  const activeFilterCount =
    (filters.countries?.length || 0) +
    (filters.degrees?.length || 0) +
    (filters.fields?.length || 0) +
    (filters.search ? 1 : 0) +
    (filters.hasFinancialAid ? 1 : 0) +
    (filters.hasHousing ? 1 : 0);

  return (
    <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8 mb-10"
      >
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
            {t("University Finder", "Buscador de Universidades")}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
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
          isLoading={statsQuery.isLoading}
        />
      </motion.div>

      {/* Main content */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
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

        <Tabs value={activeTab} className="space-y-6">
          <TabsContent value="recommended" className="space-y-6 mt-0">
            {recoQuery.isLoading && (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-[340px] w-full rounded-xl"
                  />
                ))}
              </div>
            )}

            {recoQuery.error && (
              <div className="dash-card p-6 text-center">
                <p className="text-red-600 font-medium text-sm">
                  {t(
                    "Unable to load recommendations.",
                    "No se pudieron cargar las recomendaciones."
                  )}
                </p>
              </div>
            )}

            {!recoQuery.isLoading &&
              (!universities || universities.length === 0) && !recoQuery.error && (
                <div className="dash-card p-8 text-center">
                  <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                    <GraduationCap className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-1">
                    {t("Complete your assessments first", "Completa tus evaluaciones primero")}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                    {t(
                      "Take the PCA and MIL assessments to get personalized university recommendations based on your profile.",
                      "Completa las evaluaciones PCA y MIL para obtener recomendaciones personalizadas."
                    )}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <a href="/dashboard/assessments" className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-sm font-medium hover:bg-foreground/90 transition-colors">
                      Start Assessments
                    </a>
                    <button onClick={() => setActiveTab("all")} className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-xl text-sm font-medium border border-border hover:bg-border transition-colors">
                      Browse All Universities
                    </button>
                  </div>
                </div>
              )}

            {!recoQuery.isLoading &&
              universities &&
              universities.length > 0 && (
                <div
                  className={
                    viewMode === "grid"
                      ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
                        onViewDetails={setSelectedUniversity}
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
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[340px] animate-pulse bg-secondary rounded-xl"
                  />
                ))}
              </div>
            )}
            {!listQuery.isLoading &&
              !listQuery.data?.universities.length && (
                <div className="dash-card p-12 text-center">
                  <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                    <GraduationCap className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-1">
                    {t(
                      "No universities found",
                      "No se encontraron universidades"
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "Try adjusting your filters to see more results.",
                      "Intenta ajustar tus filtros para ver más resultados."
                    )}
                  </p>
                </div>
              )}
            {!listQuery.isLoading &&
              listQuery.data?.universities.length && (
                <div
                  className={
                    viewMode === "grid"
                      ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                      : "space-y-4"
                  }
                >
                  {listQuery.data.universities.map((u) => (
                    <UniversityCard
                      key={u.id}
                      university={u}
                      onViewDetails={setSelectedUniversity}
                      isFavorite={favoritesSet.has(u.id)}
                      onFavoriteToggle={handleFavoriteToggle}
                    />
                  ))}
                </div>
              )}
          </TabsContent>
        </Tabs>
      </motion.section>

      <UniversityDetailsModal
        university={selectedUniversity}
        isOpen={!!selectedUniversity}
        onClose={() => setSelectedUniversity(null)}
        matchScore={
          selectedUniversity
            ? recommendationMap.get(selectedUniversity.id)?.matchScore
            : undefined
        }
        matchBreakdown={
          selectedUniversity
            ? recommendationMap.get(selectedUniversity.id)?.matchBreakdown
            : undefined
        }
        matchReasons={
          selectedUniversity
            ? recommendationMap.get(selectedUniversity.id)
              ?.matchReasonsArray?.[
            language === "spanish" ? "es" : "en"
            ]
            : undefined
        }
        recommendedPrograms={
          selectedUniversity
            ? recommendationMap.get(selectedUniversity.id)
              ?.recommendedPrograms
            : undefined
        }
      />
    </div>
  );
}
