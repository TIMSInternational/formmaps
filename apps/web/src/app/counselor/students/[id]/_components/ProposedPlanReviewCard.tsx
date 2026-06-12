"use client";

import { useMemo, useState } from "react";
import { GraduationCap, ChevronDown, ChevronRight, LoaderCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SequenceBuilder } from "@/components/course-plan/SequenceBuilder";
import { planItemsToEnrollments } from "@/components/course-plan/planItems";
import { PlanRationalePanel } from "@/components/course-plan/PlanRationalePanel";
import { GapReportPanel } from "@/components/course-plan/GapReportPanel";
import {
  useStudentGraduationPlan,
  useReviewGraduationPlan,
} from "@/hooks/useGraduationPlanQueries";
import type { StudentCoursePlanResponse } from "@/types/coursePlan";

interface ProposedPlanReviewCardProps {
  studentId: string;
  /** the student's official plan — existing rows render unchanged in the diff view */
  coursePlan: StudentCoursePlanResponse | undefined;
  /** the student's current grade — the counselor course-sequence response has no plan.gradeLevel */
  studentGradeLevel?: number;
}

export function ProposedPlanReviewCard({ studentId, coursePlan, studentGradeLevel }: ProposedPlanReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");

  const planQuery = useStudentGraduationPlan(studentId);
  const review = useReviewGraduationPlan(studentId);

  const plan = planQuery.data?.plan;
  const target = planQuery.data?.target;

  const byGrade = useMemo(() => {
    const map = new Map<number, { count: number; credits: number }>();
    for (const i of plan?.items ?? []) {
      const cur = map.get(i.gradeLevel) ?? { count: 0, credits: 0 };
      map.set(i.gradeLevel, { count: cur.count + 1, credits: cur.credits + i.credits });
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [plan?.items]);

  if (!plan || plan.status !== "proposed") return null;

  const currentGrade = studentGradeLevel ?? coursePlan?.plan?.gradeLevel;
  const currentGradeCount = plan.items.filter((i) => i.gradeLevel === currentGrade).length;

  const handleApprove = () => {
    review.mutate({ status: "approved" }, { onSettled: () => setApproveOpen(false) });
  };
  const handleReject = () => {
    if (!note.trim()) return;
    review.mutate(
      { status: "rejected", note: note.trim() },
      { onSettled: () => { setRejectOpen(false); setNote(""); } },
    );
  };

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold text-[#065292] flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Proposed Graduation Plan
            {target && (
              <span className="font-normal text-gray-600">
                — {[target.universityName, target.major].filter(Boolean).join(" · ")}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              onClick={() => setApproveOpen(true)}
              disabled={review.isPending}
            >
              {review.isPending && <LoaderCircle className="mr-1.5 h-3 w-3 animate-spin" />}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-red-300 text-red-600 hover:bg-red-50 text-xs"
              onClick={() => setRejectOpen(true)}
              disabled={review.isPending}
            >
              Reject
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Per-grade summary */}
        <div className="flex flex-wrap gap-2">
          {byGrade.map(([grade, agg]) => (
            <span
              key={grade}
              className="text-xs px-2.5 py-1 rounded-full bg-white border border-blue-100 text-gray-700"
            >
              Grade {grade}: {agg.count} {agg.count === 1 ? "course" : "courses"} · {agg.credits} cr
            </span>
          ))}
          <span className="text-xs px-2.5 py-1 rounded-full bg-white border border-blue-100 text-gray-500">
            {plan.totalPlannedCredits} credits total
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs font-semibold text-[#065292] hover:underline"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          View full plan
        </button>

        {expanded && (
          <div className="space-y-4">
            <SequenceBuilder
              planData={coursePlan}
              isLoading={false}
              mode="counselor"
              readOnly
              extraEnrollments={planItemsToEnrollments(plan)}
            />
            <PlanRationalePanel rationale={plan.rationale} />
            <GapReportPanel gaps={plan.gapReport ?? []} warnings={plan.warnings ?? []} />
          </div>
        )}
      </CardContent>

      {/* Approve confirmation */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Approve this plan?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Approving adds {currentGradeCount} planned{" "}
            {currentGradeCount === 1 ? "course" : "courses"} to the student&apos;s
            current-year plan now. Future years stay in the approved plan and are
            applied at year rollover.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApprove}
              disabled={review.isPending}
            >
              {review.isPending && <LoaderCircle className="mr-1.5 h-3 w-3 animate-spin" />}
              Confirm approval
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject with required note */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <XCircle className="h-4 w-4 text-red-600" />
              Send back for changes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Note to student (required)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What should change before you can approve this plan?"
              rows={3}
              maxLength={1000}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleReject}
              disabled={!note.trim() || review.isPending}
            >
              {review.isPending && <LoaderCircle className="mr-1.5 h-3 w-3 animate-spin" />}
              Send back to student
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
