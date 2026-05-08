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
  Clock,
  CheckCircle2,
  AlertTriangle,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChildProgress } from "@/hooks/useParentPortalQueries";

export default function ChildProgressPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const studentId = params.id as string;

  const { data: progress, isLoading } = useChildProgress(studentId);

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
          {t("parent.childNotFound", "Child not found")}
        </h2>
        <Button onClick={() => router.push("/parent")}>
          {t("parent.backToDashboard", "Back to Dashboard")}
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
          {t("parent.backToDashboard", "Back to Dashboard")}
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Parent</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {progress.studentName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("parent.grade", "Grade")} {progress.gradeLevel}
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
              ? t("parent.onTrackStatus", "On Track")
              : t("parent.atRiskStatus", "Needs Attention")}
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
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("parent.gpa", "GPA")}</span>
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
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("parent.credits", "Credits")}</span>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">
            {progress.creditsEarned}/{progress.creditsRequired}
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Target className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("parent.careerPath", "Career Path")}</span>
          </div>
          <p className="text-lg font-bold text-foreground tracking-tight truncate">
            {progress.careerPath || "Not Set"}
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Award className="h-4 w-4 text-purple-500" strokeWidth={1.8} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("parent.assessments", "Assessments")}</span>
          </div>
          <p className="text-lg font-bold text-foreground tracking-tight">
            {typeof progress.assessmentStatus === "object"
              ? `${progress.assessmentStatus.completed}/${progress.assessmentStatus.total}`
              : progress.assessmentStatus || "Pending"}
          </p>
        </div>
      </div>

      {/* Graduation Progress */}
      <div className="dash-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="h-5 w-5 text-indigo-500" />
          <h3 className="font-semibold text-foreground">{t("parent.graduationProgress", "Graduation Progress")}</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t("parent.creditsCompleted", "Credits Completed")}
            </span>
            <span className="font-medium text-foreground">{creditPercent}%</span>
          </div>
          <Progress value={creditPercent} className="h-3" />
          <p className="text-sm text-muted-foreground">
            {progress.creditsEarned}{" "}
            {t("parent.of", "of")} {progress.creditsRequired}{" "}
            {t("parent.creditsRequired", "credits required for graduation")}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">
            {t("parent.recentActivity", "Recent Activity")}
          </TabsTrigger>
          <TabsTrigger value="actions">
            {t("parent.pendingActions", "Pending Actions")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4">
          <div className="dash-card p-4">
            {progress.recentActivity && progress.recentActivity.length > 0 ? (
              <div className="space-y-4">
                {progress.recentActivity.map(
                  (
                    activity: { id: string; type: string; date: string; description: string },
                    index: number
                  ) => (
                    <div
                      key={activity.id || index}
                      className="flex items-start gap-3 pb-3 border-b border-[var(--border)] last:border-0"
                    >
                      <div className="mt-1">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground text-sm">
                          {activity.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(activity.date).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {activity.type}
                      </Badge>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                {t("parent.noActivity", "No recent activity")}
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <div className="dash-card p-4">
            {progress.pendingActions && progress.pendingActions.length > 0 ? (
              <div className="space-y-3">
                {progress.pendingActions.map(
                  (
                    action: { id: string; type: string; title: string; description: string; deadline?: string; actionUrl?: string },
                    index: number
                  ) => (
                    <div
                      key={action.id || index}
                      className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-amber-500" />
                        <div>
                          <p className="font-medium text-foreground text-sm">
                            {action.title}
                          </p>
                          {action.deadline && (
                            <p className="text-xs text-muted-foreground">
                              {t("parent.dueBy", "Due by")}:{" "}
                              {new Date(action.deadline).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      {action.actionUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(action.actionUrl!)}
                        >
                          {t("common.action", "Action")}
                        </Button>
                      )}
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                {t("parent.noActions", "No pending actions")}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
