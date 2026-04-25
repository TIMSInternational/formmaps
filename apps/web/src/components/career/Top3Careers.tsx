"use client";

import React from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Bolt, Compass, Briefcase } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePrefetchCareers } from "@/hooks/useCareerQueries";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";
import { careers } from "@/services/careerService";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Top3Careers({ topCareersProp }: { topCareersProp?: string[] }) {
  const { user } = useGlobalStore();
  const {
    data: timsData,
    isLoading: isTimsLoading,
    hasAssessments,
  } = useTimsCareerScoring();

  const timsCareerList = timsData?.data?.careers;

  const recs = React.useMemo(() => {
    if (topCareersProp && topCareersProp.length > 0) {
      return topCareersProp.map((c, i) => ({
        careerId: c,
        matchScore: 90 - i * 5,
        explanation: {
          en: "Based on your dashboard AI insights",
          es: "Basado en tu panel de control de IA",
        },
        title: { en: c, es: c },
        iconUrl: "",
      }));
    }
    if (timsCareerList) {
      return timsCareerList.map((sc) => {
        const staticCareer = careers.find(
          (c) => c.id === sc.programId || c.slug === sc.programId,
        );
        return {
          careerId: sc.programId,
          matchScore: sc.totalScore,
          explanation: {
            en: sc.bridgingReasons?.[0] || "Based on your profile match",
            es: sc.bridgingReasons?.[0] || "Basado en tu perfil",
          },
          title: staticCareer?.title || {
            en: sc.programTitle,
            es: sc.programTitle,
          },
          iconUrl: staticCareer?.iconUrl,
        };
      });
    }
    return [];
  }, [timsCareerList]);

  const isLoading = !topCareersProp && isTimsLoading;
  const showAssessmentPrompt = !hasAssessments && !topCareersProp;
  const prefetch = usePrefetchCareers();

  const router = useRouter();
  const { language } = useGlobalStore();

  const openCareer = (id?: string) => id && router.push(`/careers/${id}`);

  const { t } = useTranslation();

  return (
    <motion.section className="h-full" aria-labelledby="top3-careers-heading">
      <Card className="p-6 h-full glass-card">
        <h2
          id="top3-careers-heading"
          className="text-xl font-serif font-semibold text-slate-900 mb-6"
        >
          {t("dashboard.top3CareerMatch")}
        </h2>
        <ul className="space-y-4" role="list">
          {isLoading && (
            <li
              role="status"
              aria-busy="true"
              className="text-slate-500 py-4 text-center"
            >
              <span className="sr-only">Loading career matches...</span>
              <div className="animate-pulse flex space-x-4">
                <div className="rounded-xl bg-slate-100/50 h-10 w-10"></div>
                <div className="flex-1 space-y-6 py-1">
                  <div className="h-2 bg-slate-100/50 rounded"></div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="h-2 bg-slate-100/50 rounded col-span-2"></div>
                      <div className="h-2 bg-slate-100/50 rounded col-span-1"></div>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          )}

          {!isLoading && showAssessmentPrompt && recs.length === 0 && (
            <li className="text-center py-6 text-slate-500">
              <p className="mb-4 text-sm font-medium">
                {t(
                  "dashboard.completeAssessmentsForCareers",
                  "Complete your assessments to see your top career matches!",
                )}
              </p>
              <button
                onClick={() => router.push("/dashboard/assessments")}
                className="text-sm bg-indigo-50 text-indigo-600 px-4 py-2.5 rounded-lg font-medium hover:bg-indigo-100 transition-colors"
              >
                {t("dashboard.goToAssessments", "Go to Assessments")}
              </button>
            </li>
          )}

          {!isLoading && !showAssessmentPrompt && recs.length === 0 && (
            <li className="text-center py-6 text-slate-500 text-sm font-medium">
              {t(
                "dashboard.noMatchesFound",
                "No career matches found yet. Try completing more sections of your profile.",
              )}
            </li>
          )}
          {recs.slice(0, 3).map((r, i) => (
            <li
              key={r.careerId}
              className="flex items-center justify-between p-4 border border-slate-100/50 rounded-xl hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div
                  className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-sm font-bold uppercase"
                  aria-hidden="true"
                >
                  {r.careerId?.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Briefcase
                      className="w-4 h-4 text-slate-500"
                      aria-hidden="true"
                    />
                    <h3
                      className="font-medium text-slate-900"
                      onMouseEnter={() => prefetch.prefetchCareer?.(r.careerId)}
                    >
                      {r.title?.[language === "spanish" ? "es" : "en"] ||
                        r.careerId}
                    </h3>
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mt-1">
                    {r.explanation?.[language === "spanish" ? "es" : "en"] ||
                      "Profile Match"}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3 text-right">
                <div
                  className="text-sm font-bold text-slate-700"
                  aria-label={`${Math.round(r.matchScore ?? 0)} percent match`}
                >
                  {Math.round(r.matchScore ?? 0)}%
                </div>
                <button
                  type="button"
                  onClick={() => openCareer(r.careerId)}
                  className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label={`View ${r.careerId} career details`}
                >
                  <span aria-hidden="true" className="text-slate-600">
                    →
                  </span>
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => router.push("/careers")}
          className="w-full text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-6 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-md transition-colors"
        >
          {t("career.showAll")}
        </button>
      </Card>
    </motion.section>
  );
}
