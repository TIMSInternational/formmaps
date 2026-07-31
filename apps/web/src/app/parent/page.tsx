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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useParentProfile, useParentPendingEvaluations } from "@/hooks/useParentPortalQueries";
import type { ParentChildLink, ParentProfile } from "@/types/parentPortal";


export default function ParentDashboard() {
  const { t } = useTranslation("parent");
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
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{t("dashboard.badge")}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            {t("dashboard.welcome")},{" "}
            <span className="text-indigo-500">{profile?.name || "Parent"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("dashboard.subtitle")}
          </p>
        </div>

      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-indigo-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("dashboard.children")}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">{children.length}</p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FileCheck className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("dashboard.pendingEvaluations")}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">
            {loadingEvals ? "..." : pendingEvals?.length || 0}
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("dashboard.enrolled")}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">{children.length}</p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("dashboard.needsAttention")}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">
            {pendingEvals?.length || 0}
          </p>
        </div>
      </div>

      {/* Children Overview */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {t("dashboard.childrenOverview")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {children.length === 0 ? (
            <div className="col-span-2 dash-card py-12 text-center text-muted-foreground">
              {t("dashboard.noChildren")}
            </div>
          ) : (
            children.map((child) => (
              <motion.div
                key={child.studentId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div
                  className="dash-card cursor-pointer"
                  onClick={() => router.push(`/parent/children/${child.studentId}`)}
                >
                  <div className="p-5 pb-3">
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-semibold text-foreground">
                        {child.studentName}
                      </p>
                      <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-500">
                        {child.relationship}
                      </Badge>
                    </div>
                  </div>
                  <div className="px-5 pb-5 space-y-3">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {t("dashboard.grade")} {child.gradeLevel || "-"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center text-sm text-indigo-500 font-medium pt-1">
                      {t("dashboard.viewDetails")}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Pending Evaluations */}
      {pendingEvals && pendingEvals.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {t("dashboard.pendingEvalsTitle")}
          </h2>
          <div className="space-y-3">
            {pendingEvals.map(
              (evaluation: { evaluationId: string; studentName: string; deadline: string; token: string }) => (
                <div key={evaluation.evaluationId} className="dash-card p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {t("dashboard.evaluationFor")}{" "}
                      {evaluation.studentName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("dashboard.dueBy")}:{" "}
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
                    {t("dashboard.completeEvaluation")}
                  </Button>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
