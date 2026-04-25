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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="max-w-5xl mx-auto space-y-6">
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
      <div className="max-w-5xl mx-auto text-center py-16 space-y-4">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
        <h2 className="text-2xl font-bold text-gray-900">
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
    <div className="max-w-5xl mx-auto space-y-8">
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
            <h1 className="text-3xl font-bold text-gray-900">
              {progress.studentName}
            </h1>
            <p className="text-gray-500">
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
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{t("parent.gpa", "GPA")}</p>
                <p className="text-2xl font-bold">
                  {progress.gpa?.toFixed(2) || "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <GraduationCap className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">
                  {t("parent.credits", "Credits")}
                </p>
                <p className="text-2xl font-bold">
                  {progress.creditsEarned}/{progress.creditsRequired}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Target className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">
                  {t("parent.careerPath", "Career Path")}
                </p>
                <p className="text-lg font-bold truncate">
                  {progress.careerPath || "Not Set"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Award className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">
                  {t("parent.assessments", "Assessments")}
                </p>
                <p className="text-lg font-bold">
                  {typeof progress.assessmentStatus === "object"
                    ? `${progress.assessmentStatus.completed}/${progress.assessmentStatus.total}`
                    : progress.assessmentStatus || "Pending"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Graduation Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
            {t("parent.graduationProgress", "Graduation Progress")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {t("parent.creditsCompleted", "Credits Completed")}
            </span>
            <span className="font-medium">{creditPercent}%</span>
          </div>
          <Progress value={creditPercent} className="h-3" />
          <p className="text-sm text-gray-500">
            {progress.creditsEarned}{" "}
            {t("parent.of", "of")} {progress.creditsRequired}{" "}
            {t("parent.creditsRequired", "credits required for graduation")}
          </p>
        </CardContent>
      </Card>

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
          <Card>
            <CardContent className="py-4">
              {progress.recentActivity && progress.recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {progress.recentActivity.map(
                    (
                      activity: { id: string; type: string; date: string; description: string },
                      index: number
                    ) => (
                      <div
                        key={activity.id || index}
                        className="flex items-start gap-3 pb-3 border-b last:border-0"
                      >
                        <div className="mt-1">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">
                            {activity.description}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
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
                <p className="text-gray-500 text-center py-8">
                  {t("parent.noActivity", "No recent activity")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <Card>
            <CardContent className="py-4">
              {progress.pendingActions && progress.pendingActions.length > 0 ? (
                <div className="space-y-3">
                  {progress.pendingActions.map(
                    (
                      action: { id: string; type: string; title: string; description: string; deadline?: string; actionUrl?: string },
                      index: number
                    ) => (
                      <div
                        key={action.id || index}
                        className="flex items-center justify-between p-3 bg-amber-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Clock className="h-4 w-4 text-amber-600" />
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {action.title}
                            </p>
                            {action.deadline && (
                              <p className="text-xs text-gray-500">
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
                <p className="text-gray-500 text-center py-8">
                  {t("parent.noActions", "No pending actions")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
