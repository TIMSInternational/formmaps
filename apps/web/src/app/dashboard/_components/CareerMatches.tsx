import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";

interface CareerMatchesProps {
  className?: string;
}

export function CareerMatches({ className }: CareerMatchesProps) {
  const { t } = useTranslation();
  const { language } = useGlobalStore();
  const router = useRouter();

  const {
    data: timsData,
    isLoading: timsLoading,
    hasAssessments,
  } = useTimsCareerScoring();

  const timsCareerList = timsData?.data?.careers || [];

  const matches = timsCareerList.slice(0, 5).map((sc) => ({
      id: sc.programId,
      title: sc.programTitle || sc.programId,
      industry: t("career.general", "General"),
      progress: Math.round(sc.totalScore),
  }));

  const showAssessmentPrompt = !hasAssessments;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full"
      aria-labelledby="career-matches-heading"
    >
      <Card className={cn("p-6 h-full glass-card", className)}>
        <h2
          id="career-matches-heading"
          className="text-xl font-serif font-semibold text-slate-900 mb-6"
        >
          {t("dashboard.top3CareerMatch")}
        </h2>

        <ul className="space-y-4" role="list">
          {timsLoading && (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100/50 rounded-xl"></div>
              ))}
            </div>
          )}

          {!timsLoading && showAssessmentPrompt && matches.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm font-medium text-slate-500 mb-2">
                {t(
                  "dashboard.completeToSeeMatches",
                  "Complete assessments to see matches",
                )}
              </p>
            </div>
          )}

          {!timsLoading && matches.length === 0 && !showAssessmentPrompt && (
            <div className="text-center py-8 text-slate-500 text-sm font-medium">
              {t("dashboard.noMatches", "No specific matches found.")}
            </div>
          )}

          {matches.map((match, index) => (
            <motion.li
              key={match.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer"
              onClick={() => router.push(`/careers/${match.id}`)}
            >
              <div className="flex items-center space-x-4">
                {/* Industry Icon Placeholder */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600"
                  aria-hidden="true"
                >
                  <span className="font-bold text-sm uppercase">
                    {(match.industry || "C").charAt(0)}
                  </span>
                </div>

                {/* Job Info */}
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm line-clamp-1">
                    {match.title}
                  </h3>
                  <p className="text-[11px] font-medium tracking-wide uppercase text-slate-500 mt-0.5">
                    {match.industry}
                  </p>
                </div>
              </div>

              {/* Progress and Action */}
              <div className="flex items-center space-x-3">
                {/* Progress Circle */}
                <div
                  className="relative w-10 h-10"
                  role="img"
                  aria-label={`${match.progress}% match`}
                >
                  <svg
                    className="w-10 h-10 transform -rotate-90"
                    aria-hidden="true"
                  >
                    <circle
                      cx="20"
                      cy="20"
                      r="16"
                      fill="transparent"
                      stroke="#f1f5f9"
                      strokeWidth="3"
                    />
                    <motion.circle
                      cx="20"
                      cy="20"
                      r="16"
                      fill="transparent"
                      stroke={
                        match.progress > 80
                          ? "#10b981"
                          : match.progress > 60
                            ? "#f59e0b"
                            : "#2E9098"
                      }
                      strokeWidth="3"
                      strokeDasharray={`${2 * Math.PI * 16}`}
                      strokeDashoffset={`${
                        2 * Math.PI * 16 * (1 - match.progress / 100)
                      }`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 16 }}
                      animate={{
                        strokeDashoffset:
                          2 * Math.PI * 16 * (1 - match.progress / 100),
                      }}
                      transition={{ delay: index * 0.2, duration: 1 }}
                    />
                  </svg>
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <span className="text-[10px] font-bold text-slate-700">
                      {match.progress}%
                    </span>
                  </div>
                </div>

                {/* Arrow Button */}
                <button
                  type="button"
                  className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label={`View ${match.title} details`}
                >
                  <svg
                    className="w-4 h-4 text-slate-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            </motion.li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => router.push("/careers")}
          className="w-full text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-6 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-md transition-colors"
        >
          {t("dashboard.showMore")}
        </button>
      </Card>
    </motion.section>
  );
}
