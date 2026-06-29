"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeacherProfile, useTeacherPendingEvaluations } from "@/hooks/useTeacherPortalQueries";
import { isPast } from "date-fns";

export default function TeacherDashboard() {
  const { t } = useTranslation("teacher");
  const router = useRouter();

  const { data: profile, isLoading: loadingProfile } = useTeacherProfile();
  const { data: pendingEvals, isLoading: loadingEvals } = useTeacherPendingEvaluations();

  const list = Array.isArray(pendingEvals) ? pendingEvals : [];
  const overdue = list.filter((e) => isPast(new Date(e.deadline)));

  if (loadingProfile) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{t("dashboard.badge")}</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          {t("dashboard.welcome")},{" "}
          <span style={{ color: "#065292" }}>{profile?.name || t("role")}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("dashboard.subtitle")}
        </p>
      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(6,82,146,0.10)" }}>
              <FileCheck className="h-4 w-4" style={{ color: "#065292" }} strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("dashboard.pendingEvaluations")}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">
            {loadingEvals ? "…" : list.length}
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("dashboard.overdue")}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">
            {loadingEvals ? "…" : overdue.length}
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("dashboard.upcoming")}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">
            {loadingEvals ? "…" : list.length - overdue.length}
          </p>
        </div>
      </div>

      {/* Pending Evaluations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">
            {t("dashboard.pendingEvalsTitle")}
          </h2>
          {list.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => router.push("/teacher/evaluations")}>
              {t("dashboard.viewAll")}
            </Button>
          )}
        </div>
        {list.length === 0 ? (
          <div className="dash-card py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-base font-semibold text-foreground">
              {t("dashboard.allDone")}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("dashboard.noEvals")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.slice(0, 5).map((evaluation) => (
              <div key={evaluation.evaluationId} className="dash-card p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    {t("dashboard.evaluationFor")}{" "}
                    <span style={{ color: "#065292" }}>{evaluation.studentName}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.dueBy")}:{" "}
                    {new Date(evaluation.deadline).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  onClick={() =>
                    router.push(`/evaluation/evaluator?token=${evaluation.token}`)
                  }
                  size="sm"
                >
                  {t("dashboard.completeEvaluation")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
