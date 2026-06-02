"use client";

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

const PCA_EXAM_NAMES: Record<string, string> = {
  PatternRecognition: "Pattern Recognition",
  VerbalReasoning: "Verbal Reasoning",
  WorkingMemory: "Working Memory",
  NumericVelocity: "Numeric Velocity",
  VisualRotation: "Visual Rotation",
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
  const statusLabel =
    status === "completed"
      ? "Completed"
      : status === "in_progress"
        ? "In Progress"
        : "Not Started";
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
                Overall Assessment Completion
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
                      <span className="text-gray-600">{completed}/{total} assessments completed</span>
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
                  PCA Cognitive Assessment
                </div>
                {(() => {
                  const examStatuses = milHistory?.examStatus ?? [];
                  const completedCount = examStatuses.filter(
                    (e: ExamStatus) => e.status === "completed"
                  ).length;
                  return (
                    <span className="text-sm font-normal text-gray-500">
                      {completedCount}/5 completed
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
                      e.examName === displayName ||
                      e.examName?.replace(/\s+/g, "") === examKey
                  );
                  const status: string = match?.status ?? "not_started";
                  const statusLabel =
                    status === "completed"
                      ? "Completed"
                      : status === "in_progress"
                        ? "In Progress"
                        : "Not Started";
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
                  MIL / LIA Assessment
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
                      Student has not started the MIL/LIA assessment.
                    </p>
                  );
                }
                return (
                  <div className="flex items-center gap-6 text-sm">
                    {enhanced && (
                      <>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Exams</p>
                          <p className="text-lg font-bold text-gray-900 mt-0.5">
                            {enhanced.completedExams}/{enhanced.totalExams}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Completion</p>
                          <p className="text-lg font-bold text-gray-900 mt-0.5">
                            {Math.round(enhanced.completionPercentage)}%
                          </p>
                        </div>
                      </>
                    )}
                    {(mil.progress?.averageScore ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Score</p>
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
                  <Users className="h-4 w-4 text-blue-600" />
                  360° Evaluation
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
                      No evaluators have been added yet.
                    </p>
                  );
                }
                const completedCount = groups.filter(
                  (g: { isEvaluationCompleted: boolean }) => g.isEvaluationCompleted
                ).length;
                return (
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Evaluators</p>
                      <p className="text-lg font-bold text-gray-900 mt-0.5">
                        {completedCount}/{groups.length} completed
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Response Rate</p>
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
