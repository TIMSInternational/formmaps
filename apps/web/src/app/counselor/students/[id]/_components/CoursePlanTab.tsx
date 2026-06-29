"use client";

import { useTranslation } from "react-i18next";
import { Bell, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { SequenceBuilder } from "@/components/course-plan/SequenceBuilder";
import { ProposedPlanReviewCard } from "./ProposedPlanReviewCard";

interface ChangeRequest {
  id: string;
  action: string;
  courseName: string;
  courseCode: string;
  credits: number;
  gradeLevel: number;
  semester: string;
  studentNote?: string;
}

interface CoursePlanTabProps {
  studentId: string;
  studentGradeLevel?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  coursePlan: any;
  planLoading: boolean;
  pendingRequests: ChangeRequest[];
  reviewRequest: {
    mutate: (data: { requestId: string; payload: { status: "approved" | "rejected" } }) => void;
    isPending: boolean;
    variables?: { requestId: string; payload: { status: string } };
  };
  counselorAdd: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutate: (payload: any) => void;
    isPending: boolean;
  };
  counselorRemove: {
    mutate: (enrollmentId: string) => void;
    isPending: boolean;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recommendations: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  academicGaps: any;
}

export function CoursePlanTab({
  studentId,
  studentGradeLevel,
  coursePlan,
  planLoading,
  pendingRequests,
  reviewRequest,
  counselorAdd,
  counselorRemove,
  recommendations,
  academicGaps,
}: CoursePlanTabProps) {
  const { t } = useTranslation("counselor");
  return (
    <TabsContent value="course-plan" className="mt-6 space-y-6">
      {/* Proposed graduation plan awaiting review (renders only when one exists) */}
      <ProposedPlanReviewCard
        studentId={studentId}
        coursePlan={coursePlan}
        studentGradeLevel={studentGradeLevel}
      />

      {/* Pending change requests from student */}
      {pendingRequests.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {t("coursePlan.changeRequests", { n: pendingRequests.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between bg-white rounded-lg border border-amber-100 px-4 py-3 text-sm"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">
                      {req.action}
                    </Badge>
                    <span className="font-medium truncate">{req.courseName}</span>
                    <span className="text-gray-400 text-xs">
                      {req.courseCode} · {req.credits} cr · Gr.{req.gradeLevel} · {req.semester}
                    </span>
                  </div>
                  {req.studentNote && (
                    <p className="text-xs text-gray-500 italic">
                      &ldquo;{req.studentNote}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <Button
                    size="sm"
                    className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    onClick={() =>
                      reviewRequest.mutate({
                        requestId: req.id,
                        payload: { status: "approved" },
                      })
                    }
                    disabled={reviewRequest.isPending}
                  >
                    {reviewRequest.isPending && reviewRequest.variables?.requestId === req.id && reviewRequest.variables?.payload.status === "approved" ? (
                      <LoaderCircle className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : null}
                    {t("coursePlan.approve", "Approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-red-300 text-red-600 hover:bg-red-50 text-xs"
                    onClick={() =>
                      reviewRequest.mutate({
                        requestId: req.id,
                        payload: { status: "rejected" },
                      })
                    }
                    disabled={reviewRequest.isPending}
                  >
                    {reviewRequest.isPending && reviewRequest.variables?.requestId === req.id && reviewRequest.variables?.payload.status === "rejected" ? (
                      <LoaderCircle className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : null}
                    {t("coursePlan.reject", "Reject")}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Sequence Builder */}
      <SequenceBuilder
        planData={coursePlan}
        isLoading={planLoading}
        mode="counselor"
        onCounselorAdd={(payload) => counselorAdd.mutate(payload)}
        onCounselorRemove={(enrollmentId) => counselorRemove.mutate(enrollmentId)}
        isCounselorAddPending={counselorAdd.isPending}
        isCounselorRemovePending={counselorRemove.isPending}
        recommendations={recommendations}
        academicGaps={academicGaps}
      />
    </TabsContent>
  );
}
