"use client";

import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  ArrowLeft,
  BookOpen,
  GraduationCap,
  TrendingUp,
  Target,
  CheckCircle2,
  AlertTriangle,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChildProgress, useChildResults } from "@/hooks/useParentPortalQueries";
import { useChildCoursePlan } from "@/hooks/useGraduationPlanQueries";
import { ChildPlanTab } from "./_components/ChildPlanTab";
import { ChildResultsTab } from "./_components/ChildResultsTab";

export default function ChildProgressPage() {
  const { t, i18n } = useTranslation("parent");
  const router = useRouter();
  const params = useParams();
  const studentId = params.id as string;

  const lang: "es" | "en" = i18n.language?.startsWith("es") ? "es" : "en";
  const { data: progress, isLoading } = useChildProgress(studentId);
  const results = useChildResults(studentId, lang);
  // The goal the student set in their graduation plan — real data, or an honest "not set yet".
  const { data: coursePlan } = useChildCoursePlan(studentId);
  const careerGoal = coursePlan?.target
    ? [coursePlan.target.major, coursePlan.target.universityName].filter(Boolean).join(" · ")
    : "";
  // Recent activity = the assessments the child finished, newest first (from the results above).
  const recentActivity = (results.data?.assessments ?? [])
    .filter((a) => a.status === "completed" && a.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="text-center py-16 space-y-4">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
        <h2 className="text-2xl font-bold text-foreground">
          {t("progress.childNotFound")}
        </h2>
        <Button onClick={() => router.push("/parent")}>
          {t("progress.backToDashboard")}
        </Button>
      </div>
    );
  }

  const creditPercent = progress.creditsRequired
    ? Math.round((progress.creditsEarned / progress.creditsRequired) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <Button
          variant="ghost"
          onClick={() => router.push("/parent")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("progress.backToDashboard")}
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{t("progress.badge")}</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {progress.studentName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("progress.grade")} {progress.gradeLevel}
            </p>
          </div>
          <Badge
            variant="secondary"
            className={
              progress.isOnTrack
                ? "bg-emerald-100 text-emerald-700 text-base py-1 px-3"
                : "bg-red-100 text-red-700 text-base py-1 px-3"
            }
          >
            {progress.isOnTrack
              ? t("progress.onTrack")
              : t("progress.atRisk")}
          </Badge>
        </div>
      </motion.div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-indigo-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("progress.gpa")}</span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">
            {progress.gpa?.toFixed(2) || "N/A"}
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("progress.credits")}</span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">
            {progress.creditsEarned}/{progress.creditsRequired ?? "\u2014"}
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Target className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("progress.careerPath")}</span>
          </div>
          <p className="text-lg font-bold text-foreground tracking-tight truncate">
            {careerGoal || t("progress.careerPathNotSet")}
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Award className="h-4 w-4 text-purple-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("progress.assessments")}</span>
          </div>
          <p className="text-lg font-bold text-foreground tracking-tight">
            {typeof progress.assessmentStatus === "object"
              ? `${progress.assessmentStatus.completed}/${progress.assessmentStatus.total}`
              : progress.assessmentStatus || t("progress.assessmentPending")}
          </p>
        </div>
      </div>

      {/* Graduation Progress */}
      <div className="dash-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="h-5 w-5 text-indigo-500" />
          <h3 className="font-semibold text-foreground">{t("progress.graduationProgress")}</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t("progress.creditsCompleted")}
            </span>
            <span className="font-medium text-foreground">{creditPercent}%</span>
          </div>
          <Progress value={creditPercent} className="h-3" />
          <p className="text-sm text-muted-foreground">
            {progress.creditsEarned}{" "}
            {t("progress.of")} {progress.creditsRequired ?? "\u2014"}{" "}
            {t("progress.creditsRequired")}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results">{t("results.tab")}</TabsTrigger>
          <TabsTrigger value="activity">
            {t("progress.recentActivity")}
          </TabsTrigger>
          <TabsTrigger value="course-plan">
            {t("progress.coursePlan")}
          </TabsTrigger>
        </TabsList>

        <ChildResultsTab
          studentId={studentId}
          lang={lang}
          results={results.data}
          isLoading={results.isLoading}
          error={results.error}
        />

        <TabsContent value="activity" className="mt-4">
          <div className="dash-card p-4">
            {recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((a) => (
                  <div
                    key={a.key}
                    className="flex items-start gap-3 pb-3 border-b border-[var(--border)] last:border-0"
                  >
                    <div className="mt-1">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground text-sm">
                        {t("progress.completedAssessment", { title: a.title })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(a.completedAt!).toLocaleDateString(i18n.language)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                {t("progress.noActivity")}
              </p>
            )}
          </div>
        </TabsContent>

        <ChildPlanTab studentId={studentId} />
      </Tabs>
    </div>
  );
}
