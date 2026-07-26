"use client";

import { useTranslation } from "react-i18next";
import {
  Brain,
  BookOpen,
  Users,
  CheckCircle2,
  Circle,
  RotateCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const ASSESSMENT_COLORS: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  in_progress: "bg-amber-100 text-amber-700",
  not_started: "bg-gray-100 text-gray-500",
};

const PCA_EXAM_KEYS = [
  "PatternRecognition",
  "VerbalReasoning",
  "WorkingMemory",
  "NumericVelocity",
  "VisualRotation",
] as const;

interface ExamStatus {
  examName?: string;
  status?: string;
}

interface AssessmentsTabProps {
  isLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessmentProgress: any;
  milHistory: { examStatus?: ExamStatus[] } | undefined;
  evalGroups: { isEvaluationCompleted: boolean }[] | undefined;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("counselor");
  const statusLabel =
    status === "completed"
      ? t("assessments.statusCompleted", "Completed")
      : status === "in_progress"
        ? t("assessments.statusInProgress", "In Progress")
        : t("assessments.statusNotStarted", "Not Started");
  return (
    <Badge
      variant="secondary"
      className={cn("text-xs", ASSESSMENT_COLORS[status] || "bg-gray-100 text-gray-500")}
    >
      {statusLabel}
    </Badge>
  );
}

export function AssessmentsTab({ isLoading, assessmentProgress, milHistory, evalGroups }: AssessmentsTabProps) {
  const { t } = useTranslation("counselor");

  const PCA_EXAM_NAMES: Record<string, string> = {
    PatternRecognition: t("assessments.examPattern", "Pattern Recognition"),
    VerbalReasoning: t("assessments.examVerbal", "Verbal Reasoning"),
    WorkingMemory: t("assessments.examMemory", "Working Memory"),
    NumericVelocity: t("assessments.examNumeric", "Numeric Velocity"),
    VisualRotation: t("assessments.examRotation", "Visual Rotation"),
  };

  return (
    <TabsContent value="assessments" className="mt-6 space-y-5">
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          {/* Overall Completion */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4 text-violet-600" />
                {t("assessments.overallCompletion", "Overall Assessment Completion")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const pct = assessmentProgress?.overallCompletion?.percentageComplete ?? 0;
                const completed = assessmentProgress?.overallCompletion?.completedAssessments ?? 0;
                const total = assessmentProgress?.overallCompletion?.totalAssessments ?? 3;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{t("assessments.assessmentsCompleted", { completed, total })}</span>
                      <span className="font-semibold text-gray-900">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-2.5" />
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* PCA Cognitive Assessment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-indigo-600" />
                  {t("assessments.pcaTitle", "PCA Assessment")}
                </div>
                {(() => {
                  const examStatuses = milHistory?.examStatus ?? [];
                  const completedCount = examStatuses.filter(
                    (e: ExamStatus) => e.status === "completed"
                  ).length;
                  return (
                    <span className="text-sm font-normal text-gray-500">
                      {t("assessments.pcaCompleted", { n: completedCount })}
                    </span>
                  );
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PCA_EXAM_KEYS.map((examKey) => {
                  const displayName = PCA_EXAM_NAMES[examKey];
                  const examStatuses = milHistory?.examStatus ?? [];
                  const match = examStatuses.find(
                    (e: ExamStatus) =>
                      e.examName === PCA_EXAM_NAMES[examKey] ||
                      e.examName?.replace(/\s+/g, "") === examKey
                  );
                  const status: string = match?.status ?? "not_started";
                  const statusLabel =
                    status === "completed"
                      ? t("assessments.statusCompleted", "Completed")
                      : status === "in_progress"
                        ? t("assessments.statusInProgress", "In Progress")
                        : t("assessments.statusNotStarted", "Not Started");
                  const StatusIcon =
                    status === "completed"
                      ? CheckCircle2
                      : status === "in_progress"
                        ? RotateCw
                        : Circle;
                  const iconColor =
                    status === "completed"
                      ? "text-emerald-500"
                      : status === "in_progress"
                        ? "text-amber-500"
                        : "text-gray-300";

                  return (
                    <div
                      key={examKey}
                      className="flex items-center justify-between p-3 border rounded-xl"
                    >
                      <div className="flex items-center gap-2.5">
                        <StatusIcon className={cn("h-4 w-4", iconColor)} />
                        <span className="text-sm font-medium text-gray-700">
                          {displayName}
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          ASSESSMENT_COLORS[status] || "bg-gray-100 text-gray-500"
                        )}
                      >
                        {statusLabel}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* MIL/LIA Assessment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-teal-600" />
                  {t("assessments.milTitle", "MIL / LIA Assessment")}
                </div>
                <StatusBadge status={assessmentProgress?.milAssessment?.status ?? "not_started"} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const mil = assessmentProgress?.milAssessment;
                const enhanced = mil?.enhancedData;
                if (!mil || mil.status === "not_started") {
                  return (
                    <p className="text-sm text-gray-400 text-center py-4">
                      {t("assessments.milNotStarted", "Student has not started the MIL/LIA assessment.")}
                    </p>
                  );
                }
                return (
                  <div className="flex items-center gap-6 text-sm">
                    {enhanced && (
                      <>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("assessments.colExams", "Exams")}</p>
                          <p className="text-lg font-bold text-gray-900 mt-0.5">
                            {enhanced.completedExams}/{enhanced.totalExams}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("assessments.colCompletion", "Completion")}</p>
                          <p className="text-lg font-bold text-gray-900 mt-0.5">
                            {Math.round(enhanced.completionPercentage)}%
                          </p>
                        </div>
                      </>
                    )}
                    {(mil.progress?.averageScore ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("assessments.colAvgScore", "Avg Score")}</p>
                        <p className="text-lg font-bold text-gray-900 mt-0.5">
                          {Math.round(mil.progress?.averageScore ?? 0)}%
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* 360 Evaluation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#2E9098]" />
                  {t("assessments.eval360Title", "360° Evaluation")}
                </div>
                <StatusBadge status={assessmentProgress?.evaluationAssessment?.status ?? "not_started"} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const evalData = assessmentProgress?.evaluationAssessment;
                const groups = evalGroups ?? evalData?.evaluationGroups ?? [];
                if (!groups.length) {
                  return (
                    <p className="text-sm text-gray-400 text-center py-4">
                      {t("assessments.noEvaluators", "No evaluators have been added yet.")}
                    </p>
                  );
                }
                const completedCount = groups.filter(
                  (g: { isEvaluationCompleted: boolean }) => g.isEvaluationCompleted
                ).length;
                return (
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("assessments.colEvaluators", "Evaluators")}</p>
                      <p className="text-lg font-bold text-gray-900 mt-0.5">
                        {completedCount}/{groups.length} completed
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("assessments.colResponseRate", "Response Rate")}</p>
                      <p className="text-lg font-bold text-gray-900 mt-0.5">
                        {groups.length > 0
                          ? Math.round((completedCount / groups.length) * 100)
                          : 0}%
                      </p>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}
    </TabsContent>
  );
}
