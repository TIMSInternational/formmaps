"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import CareerCard from "./CareerCard";
import SkeletonCareerCard from "./SkeletonCareerCard";
import CareerCompareBar from "./CareerCompareBar";
import { CareerFilters } from "./CareerFilters";
import { useCareerList } from "@/hooks/useCareerQueries";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";
import { motion } from "motion/react";
import { Compass, SearchX } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

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

  // Loading should be true if EITHER is loading, to prevent showing fallback data while waiting for API
  const isLoading = timsLoading || listLoading;

  const timsCareerList = timsData?.data?.careers;

  const displayCareers = React.useMemo(() => {
    // If TIMS data is available, use it as the PRIMARY career list.
    // Enrich each career with local static data (icons, descriptions) if available.
    if (timsCareerList && timsCareerList.length > 0) {
      const staticCareers = listData?.careers || [];

      const list = timsCareerList.map((sc) => {
        // Try to find a matching static career for richer metadata
        const local = staticCareers.find(
          (c) => c.id === sc.programId || c.slug === sc.programId
        );

        if (local) {
          // Enrich existing static career with live scores
          return {
            ...local,
            matchScore: sc.totalScore,
            needsBridging: sc.needsBridging,
            bridgingReasons: sc.bridgingReasons,
          };
        }

        // No local match — build a career object from API data
        return {
          id: sc.programId,
          familyId: sc.cluster || "unknown",
          slug: sc.programId.toLowerCase().replace(/\s+/g, "-"),
          title: { en: sc.programTitle, es: sc.programTitle },
          shortDescription: {
            en: "Recommended career based on your profile analysis.",
            es: "Carrera recomendada basada en tu análisis de perfil.",
          },
          matchScore: sc.totalScore,
          needsBridging: sc.needsBridging,
          bridgingReasons: sc.bridgingReasons,
          published: true,
          industries: [] as string[],
          skills: [] as any[],
          salaryRange: undefined,
          demandStats: undefined,
        };
      });

      // Apply sort
      const sort = filters.sort || "recommended";
      if (sort === "recommended" || sort === "match") {
        list.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
      }

      return list;
    }

    // Fallback: TIMS data not available yet (or failed), use static list
    if (!isLoading && listData?.careers) {
      return [...listData.careers];
    }

    return [];
  }, [listData, timsCareerList, filters.sort, isLoading]);

  // Virtual List Logic
  const parentRef = React.useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = React.useState(3);

  React.useEffect(() => {
    const handleResize = () => {
      // Matches tailwind breakpoints: md: 768px, lg: 1024px
      if (window.innerWidth < 768) setColumnCount(1);
      else if (window.innerWidth < 1024) setColumnCount(2);
      else setColumnCount(3);
    };
    handleResize(); // Initial check
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const rows = React.useMemo(() => {
    const result = [];
    for (let i = 0; i < displayCareers.length; i += columnCount) {
      result.push(displayCareers.slice(i, i + columnCount));
    }
    return result;
  }, [displayCareers, columnCount]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 400, // Approximate height of a card row + gap
    overscan: 5,
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative shrink-0">
        <div className="space-y-2 max-w-2xl">
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-200" aria-hidden="true">
              <Compass className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            {t("career.explorer.title", "Career Explorer")}
          </h2>
          <p className="text-gray-500 text-lg ml-[3.75rem] leading-relaxed">
            {t("career.explorer.subtitle", "Explore career paths tailored to your unique profile. Filter by industry, education, and demand to find your perfect match.")}
          </p>
        </div>
      </div>

      <div className="shrink-0">
        <CareerFilters filters={filters} onChange={setFilters} />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCareerCard key={i} />
          ))}
        </div>
      )}

      {!isLoading && displayCareers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-3xl border border-dashed border-gray-200" role="alert">
          <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mb-4" aria-hidden="true">
            <SearchX className="h-10 w-10 text-gray-400" aria-hidden="true" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{t("career.explorer.noResults", "No careers found")}</h3>
          <p className="text-gray-500 max-w-sm">
            {t("career.explorer.noResultsDesc", "We couldn't find any careers matching your current filters. Try adjusting your search criteria.")}
          </p>
        </div>
      )}

      {!isLoading && displayCareers.length > 0 && (
        <div
          ref={parentRef}
          className="w-full overflow-y-auto"
          style={{ height: "calc(100vh - 300px)" }} // Adjust based on header/filter height
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowCareers = rows[virtualRow.index];
              return (
                <div
                  key={virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6"
                >
                  {rowCareers.map((career) => (
                    <motion.div
                      key={career.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="h-full"
                    >
                      <CareerCard career={career} />
                    </motion.div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

