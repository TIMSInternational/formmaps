"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  Users,
  FileCheck,
  TrendingUp,
  AlertTriangle,
  GraduationCap,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useParentProfile, useParentPendingEvaluations } from "@/hooks/useParentPortalQueries";
import type { ParentChildLink, ParentProfile } from "@/types/parentPortal";


export default function ParentDashboard() {
  const { t } = useTranslation();
  const router = useRouter();

  const { data: profile, isLoading: loadingProfile } = useParentProfile();
  const { data: pendingEvals, isLoading: loadingEvals } = useParentPendingEvaluations();

  const isLoading = loadingProfile;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const children: ParentChildLink[] = profile?.children || [];

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t("parent.welcome", "Welcome back")},{" "}
            <span className="text-indigo-600">{profile?.name || "Parent"}</span>
          </h1>
          <p className="text-gray-500 mt-1">
            {t("parent.dashboardSubtitle", "Track your children's academic progress and upcoming tasks.")}
          </p>
        </div>

      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Users className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">
                  {t("parent.children", "Children")}
                </p>
                <p className="text-2xl font-bold">{children.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <FileCheck className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">
                  {t("parent.pendingEvaluations", "Pending Evaluations")}
                </p>
                <p className="text-2xl font-bold">
                  {loadingEvals ? "..." : pendingEvals?.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">
                  {t("parent.enrolled", "Enrolled")}
                </p>
                <p className="text-2xl font-bold">
                  {children.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">
                  {t("parent.needsAttention", "Needs Attention")}
                </p>
                <p className="text-2xl font-bold">
                  {pendingEvals?.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Children Overview */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t("parent.childrenOverview", "Children Overview")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {children.length === 0 ? (
            <Card className="col-span-2">
              <CardContent className="py-12 text-center text-gray-500">
                {t("parent.noChildren", "No children linked to your account yet.")}
              </CardContent>
            </Card>
          ) : (
            children.map((child) => (
              <motion.div
                key={child.studentId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => router.push(`/parent/children/${child.studentId}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        {child.studentName}
                      </CardTitle>
                      <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                        {child.relationship}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-600">
                          {t("parent.grade", "Grade")} {child.gradeLevel || "-"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center text-sm text-indigo-600 font-medium pt-1">
                      {t("parent.viewDetails", "View Details")}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Pending Evaluations */}
      {pendingEvals && pendingEvals.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {t("parent.pendingEvals", "Pending 360° Evaluations")}
          </h2>
          <div className="space-y-3">
            {pendingEvals.map(
              (evaluation: { evaluationId: string; studentName: string; deadline: string; token: string }) => (
                <Card key={evaluation.evaluationId}>
                  <CardContent className="py-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {t("parent.evaluationFor", "360° Evaluation for")}{" "}
                        {evaluation.studentName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {t("parent.dueBy", "Due by")}:{" "}
                        {new Date(evaluation.deadline).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      onClick={() =>
                        router.push(
                          `/evaluation/evaluator?token=${evaluation.token}`
                        )
                      }
                      size="sm"
                    >
                      {t("parent.completeEvaluation", "Complete Evaluation")}
                    </Button>
                  </CardContent>
                </Card>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
