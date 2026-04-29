"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Sparkles, Lightbulb, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMyCoursePlan,
  useMyCourseRecommendations,
  useSubmitChangeRequest,
  useCancelChangeRequest,
  useMyChangeRequests,
} from "@/hooks/useCoursePlanQueries";
import { SequenceBuilder } from "@/components/course-plan/SequenceBuilder";
import { cn } from "@/lib/utils";
import type { CourseChangeRequestPayload } from "@/types/coursePlan";

export default function CoursePlanPage() {
  const { t } = useTranslation();
  const { data: planData, isLoading } = useMyCoursePlan();
  const { data: recommendations, isLoading: loadingRecs } = useMyCourseRecommendations();
  const submitRequest = useSubmitChangeRequest();
  const cancelRequest = useCancelChangeRequest();
  const { data: changeRequestsData } = useMyChangeRequests();

  const [showRecommendations, setShowRecommendations] = useState(false);

  const pendingRequests = changeRequestsData?.data ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border"
      >
        <div className="w-full">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            {t("coursePlan.badge", "Academic Curriculum")}
          </p>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
                {t("coursePlan.title", "My Course Sequence")}
              </h1>
              <p className="text-base text-muted-foreground max-w-xl">
                {t(
                  "coursePlan.subtitle",
                  "View your 4-year plan and track your academic progression. Need adjustments? Submit a request."
                )}
              </p>
            </div>

            <div className="flex-shrink-0">
              <Button
                size="lg"
                className={cn(
                  "rounded-xl transition-all duration-300 px-6 font-medium border",
                  showRecommendations
                    ? "bg-foreground text-background hover:bg-foreground/90 border-transparent"
                    : "bg-card hover:bg-secondary text-foreground border-border"
                )}
                onClick={() => setShowRecommendations(!showRecommendations)}
              >
                <Sparkles className={cn("h-5 w-5 mr-2", showRecommendations ? "text-background/70" : "text-indigo-500")} />
                <span>
                  {showRecommendations
                    ? t("coursePlan.hideRecommendations", "Hide AI Recommendations")
                    : t("coursePlan.aiRecommendations", "View AI Recommendations")}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* AI Recommendations Panel */}
      {showRecommendations && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <div className="dash-card p-6 mt-2">
            <div className="flex items-center gap-2 mb-6 text-foreground border-b border-border pb-4">
              <div className="p-2 bg-secondary rounded-lg">
                <Lightbulb className="h-5 w-5 text-indigo-500" />
              </div>
              <h2 className="text-lg font-bold">{t("coursePlan.recommendedCourses", "AI-Recommended Courses")}</h2>
            </div>

            {loadingRecs ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl bg-secondary" />)}
              </div>
            ) : recommendations && recommendations.length > 0 ? (
              <div className="space-y-4">
                {recommendations.map((rec, index) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    key={rec.courseId}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-secondary/50 hover:bg-secondary rounded-xl border border-border hover:border-foreground/10 transition-all duration-300"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-foreground text-lg transition-colors">{rec.courseName}</h3>
                        <span
                          className={cn(
                            "text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border",
                            rec.priority === "high"
                              ? "bg-rose-50 border-rose-200 text-rose-700"
                              : rec.priority === "medium"
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : "bg-emerald-50 border-emerald-200 text-emerald-700"
                          )}
                        >
                          {rec.priority} priority
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{rec.reason}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs font-medium text-muted-foreground">
                        <span className="flex items-center gap-1.5 bg-secondary px-2 py-1 rounded-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          {rec.credits} credits
                        </span>
                        <span className="flex items-center gap-1.5 bg-secondary px-2 py-1 rounded-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                          {rec.courseCode}
                        </span>
                      </div>
                    </div>
                    <Button
                      className="sm:w-auto w-full rounded-xl bg-foreground text-background hover:bg-foreground/90 border-0 transition-all duration-300"
                      onClick={() =>
                        submitRequest.mutate({
                          courseId: rec.courseId,
                          courseCode: rec.courseCode,
                          courseName: rec.courseName,
                          credits: rec.credits,
                          gradeLevel: planData?.plan?.gradeLevel ?? 9,
                          semester: rec.semester ?? "Fall",
                          action: "add",
                        } satisfies CourseChangeRequestPayload)
                      }
                      disabled={submitRequest.isPending}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t("coursePlan.request", "Request Course")}
                    </Button>
                  </motion.div>
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <div className="w-16 h-16 bg-secondary rounded-xl border border-border flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Recommendations Yet</h3>
                <p className="text-muted-foreground max-w-sm">
                  {t(
                    "coursePlan.noRecommendations",
                    "Complete your academic and career assessments to unlock personalized AI course recommendations."
                  )}
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      {/* Sequence Builder */}
      <SequenceBuilder
        planData={planData}
        isLoading={isLoading}
        mode="student"
        onSubmitRequest={(payload) =>
          submitRequest.mutate(payload satisfies CourseChangeRequestPayload)
        }
        isSubmitPending={submitRequest.isPending}
        onCancelRequest={(requestId) => cancelRequest.mutate(requestId)}
        pendingRequests={pendingRequests}
      />
    </div>
  );
}
