"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Sparkles, Lightbulb, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100/50 relative"
      >
        {/* Ambient Background Glows */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-emerald-300/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-32 right-0 w-64 h-64 bg-teal-300/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full">
          <Badge variant="outline" className="mb-3 border-emerald-200 text-emerald-700 bg-emerald-50/50">
            {t("coursePlan.badge", "Academic Curriculum")}
          </Badge>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">
                {t("coursePlan.title", "My Course Sequence")}
              </h1>
              <p className="text-lg text-gray-500 max-w-xl">
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
                  "rounded-full transition-all duration-300 px-6 font-medium shadow-md border group relative overflow-hidden",
                  showRecommendations
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-indigo-200"
                    : "bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200"
                )}
                onClick={() => setShowRecommendations(!showRecommendations)}
              >
                {!showRecommendations && (
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/0 via-indigo-100/30 to-indigo-50/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                )}
                <Sparkles className={cn("h-5 w-5 mr-2", showRecommendations ? "text-indigo-200" : "text-indigo-500")} />
                <span className="relative z-10">
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
          <div className="relative mt-2">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/80 to-white/20 backdrop-blur-xl rounded-3xl border border-indigo-100 shadow-xl shadow-indigo-100/40 pointer-events-none" />
            <div className="relative z-10 p-6">
              <div className="flex items-center gap-2 mb-6 text-indigo-900 border-b border-indigo-100/50 pb-4">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Lightbulb className="h-5 w-5 text-indigo-600" />
                </div>
                <h2 className="text-lg font-bold">{t("coursePlan.recommendedCourses", "AI-Recommended Courses")}</h2>
              </div>

              {loadingRecs ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl bg-indigo-50/50" />)}
                </div>
              ) : recommendations && recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((rec, index) => (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      key={rec.courseId}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white/80 hover:bg-white rounded-2xl border border-indigo-50 hover:border-indigo-200 shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-gray-900 text-lg group-hover:text-indigo-700 transition-colors">{rec.courseName}</h3>
                          <Badge
                            variant="outline"
                            className={cn(
                              "px-2.5 py-0.5 border shadow-sm",
                              rec.priority === "high"
                                ? "bg-rose-50 border-rose-200 text-rose-700"
                                : rec.priority === "medium"
                                  ? "bg-amber-50 border-amber-200 text-amber-700"
                                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
                            )}
                          >
                            {rec.priority} priority
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">{rec.reason}</p>
                        <div className="flex items-center gap-4 mt-3 text-xs font-medium text-gray-400">
                          <span className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            {rec.credits} credits
                          </span>
                          <span className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                            {rec.courseCode}
                          </span>
                        </div>
                      </div>
                      <Button
                        className="sm:w-auto w-full rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border-0 shadow-none hover:shadow-lg hover:shadow-indigo-200 transition-all duration-300"
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
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-indigo-50 flex items-center justify-center mb-4">
                    <Sparkles className="h-8 w-8 text-indigo-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Recommendations Yet</h3>
                  <p className="text-gray-500 max-w-sm">
                    {t(
                      "coursePlan.noRecommendations",
                      "Complete your academic and career assessments to unlock personalized AI course recommendations."
                    )}
                  </p>
                </motion.div>
              )}
            </div>
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
