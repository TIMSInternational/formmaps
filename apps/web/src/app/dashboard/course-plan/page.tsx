"use client";

import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api/apiClient";
import {
  useMyCoursePlan,
  useMyChangeRequests,
  useMyCourseRecommendations,
  useAddCourseToPlan,
  useRemoveCourseFromPlan,
  useCancelChangeRequest,
} from "@/hooks/useCoursePlanQueries";
import {
  useGraduationTarget,
  useSetGraduationTarget,
  useGenerateGraduationPlan,
  useMyGraduationPlan,
  useSubmitGraduationPlan,
  useDiscardGraduationDraft,
} from "@/hooks/useGraduationPlanQueries";
import type { StudentCoursePlanResponse } from "@/types/coursePlan";
import type { SetGraduationTargetPayload } from "@/types/graduationPlan";
import { GraduationTargetCard } from "./_components/GraduationTargetCard";
import { TargetPickerDialog } from "./_components/TargetPickerDialog";
import { DraftPlanSection } from "./_components/DraftPlanSection";
import { PlanRationalePanel } from "./_components/PlanRationalePanel";
import { GapReportPanel } from "./_components/GapReportPanel";
import { SupplementalRail } from "./_components/SupplementalRail";
import { MyClassesSection } from "./_components/MyClassesSection";
import { CatalogSection } from "./_components/CatalogSection";
import { ChangeRequestsSection } from "./_components/ChangeRequestsSection";
import type { SchoolCourse, PlanEnrollment } from "./_components/types";

const OPEN_PLAN_STATUSES = ["draft", "proposed", "rejected"];

export default function CoursePlanPage() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const planQuery = useMyCoursePlan();
  const requestsQuery = useMyChangeRequests();
  const recsQuery = useMyCourseRecommendations();
  const targetQuery = useGraduationTarget();
  const gradPlanQuery = useMyGraduationPlan();
  const catalogQuery = useQuery({
    queryKey: ["school-catalog", "course-plan"],
    queryFn: () => apiRequest("/api/v1/school-admin/courses?limit=100"),
    staleTime: 5 * 60 * 1000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addMutation = useAddCourseToPlan();
  const removeMutation = useRemoveCourseFromPlan();
  const cancelMutation = useCancelChangeRequest();
  const setTargetMutation = useSetGraduationTarget();
  const generateMutation = useGenerateGraduationPlan();
  const submitMutation = useSubmitGraduationPlan();
  const discardMutation = useDiscardGraduationDraft();

  // ── Derived data ───────────────────────────────────────────────────────────
  // The student endpoint returns bare plan rows; names resolve from the catalog.
  const planRaw = planQuery.data?.plan as unknown as
    | { gradeLevel?: number | null; totalCreditsEarned?: number; enrollments?: PlanEnrollment[] }
    | undefined;
  const enrollments = planRaw?.enrollments ?? [];
  const gradeLevel = planRaw?.gradeLevel ?? null;
  const creditsEarned = Number(planRaw?.totalCreditsEarned ?? 0);

  const catalog: SchoolCourse[] = useMemo(() => {
    const res = catalogQuery.data as { data?: { data?: SchoolCourse[] } | SchoolCourse[] } | undefined;
    const courses = (res?.data as { data?: SchoolCourse[] })?.data ?? res?.data ?? [];
    return Array.isArray(courses) ? courses : [];
  }, [catalogQuery.data]);

  const courseById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const plannedCourseIds = useMemo(() => new Set(enrollments.map((e) => e.courseId)), [enrollments]);
  const requests = requestsQuery.data?.data ?? [];

  const target = targetQuery.data;
  const gradPlan = gradPlanQuery.data ?? null;
  const locked = recsQuery.data?.locked === true;
  const hasTarget = !!target && !target.suggested;
  const showDraftSection = !!gradPlan && OPEN_PLAN_STATUSES.includes(gradPlan.status);

  // Existing rows enriched for the SequenceBuilder diff view (rows lack names/grades).
  const enrichedPlanData: StudentCoursePlanResponse = useMemo(
    () => ({
      plan: {
        studentId: "",
        gradeLevel: gradeLevel ?? 9,
        enrollments: enrollments.map((e) => {
          const c = courseById.get(e.courseId);
          return {
            id: e.id,
            courseId: e.courseId,
            courseCode: c?.code ?? "",
            courseName: c?.name ?? "Unknown course",
            category: c?.department ?? "",
            credits: Number(c?.credits ?? 0),
            gradeLevel: gradeLevel ?? 9,
            semester: e.term ?? "Fall",
            status: (e.status || "planned") as "planned",
          };
        }),
      },
      recommendations: [],
    }),
    [enrollments, courseById, gradeLevel],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAdd = async (course: SchoolCourse, term: string) => {
    setBusyId(course.id);
    try {
      await addMutation.mutateAsync({ courseId: course.id, gradeLevel: gradeLevel ?? 9, semester: term });
    } catch { /* hook toasts */ } finally { setBusyId(null); }
  };

  const handleRemove = async (enrollment: PlanEnrollment) => {
    setBusyId(enrollment.courseId);
    try {
      // The API removes planned entries by courseId
      await removeMutation.mutateAsync(enrollment.courseId);
    } catch { /* hook toasts */ } finally { setBusyId(null); }
  };

  const handleSaveTarget = async (payload: SetGraduationTargetPayload) => {
    try {
      await setTargetMutation.mutateAsync(payload);
      setPickerOpen(false);
    } catch { /* hook toasts */ }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (planQuery.isLoading) {
    return (
      <div className="space-y-4 p-2">
        <Skeleton className="h-8 w-56" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-40 w-full" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-64 w-full" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  if (planQuery.isError) {
    return (
      <div className="text-center py-16">
        <p className="text-sm mb-3" style={{ color: "var(--admin-font-secondary)" }}>
          Failed to load your course plan.
        </p>
        <button
          type="button"
          onClick={() => planQuery.refetch()}
          className="px-4 py-2 rounded-md text-sm font-semibold"
          style={{ background: "var(--admin-accent-blue, #065292)", color: "#fff" }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" style={{ color: "var(--admin-accent-blue, #065292)" }} />
          <h1 className="text-xl font-bold" style={{ color: "var(--admin-font-primary)" }}>
            Course Plan
          </h1>
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--admin-font-secondary)" }}>
          Plan your classes for the year{gradeLevel ? ` · Grade ${gradeLevel}` : ""} · {creditsEarned} credits earned
        </p>
      </div>

      <GraduationTargetCard
        target={target}
        isLoading={targetQuery.isLoading || recsQuery.isLoading}
        locked={locked}
        completion={recsQuery.data?.completion}
        planStatus={gradPlan?.status ?? null}
        canGenerate={hasTarget && !showDraftSection}
        isGenerating={generateMutation.isPending}
        onChooseGoal={() => setPickerOpen(true)}
        onGenerate={() => generateMutation.mutate(undefined)}
      />

      {showDraftSection && gradPlan && (
        <>
          <DraftPlanSection
            plan={gradPlan}
            planData={enrichedPlanData}
            onSubmit={() => submitMutation.mutate()}
            onRegenerate={() => generateMutation.mutate({ force: true })}
            onDiscard={() => discardMutation.mutate()}
            isSubmitting={submitMutation.isPending}
            isRegenerating={generateMutation.isPending}
            isDiscarding={discardMutation.isPending}
          />
          <PlanRationalePanel rationale={gradPlan.rationale} />
          <GapReportPanel
            gaps={gradPlan.gapReport ?? []}
            warnings={gradPlan.warnings ?? []}
            linkToSupplemental
          />
        </>
      )}

      <MyClassesSection
        enrollments={enrollments}
        courseById={courseById}
        onRemove={handleRemove}
        busyId={busyId}
      />

      <CatalogSection
        catalog={catalog}
        plannedCourseIds={plannedCourseIds}
        onAdd={handleAdd}
        busyId={busyId}
        suggestions={locked ? [] : recsQuery.data?.data ?? []}
      />

      <SupplementalRail enabled={hasTarget} />

      <ChangeRequestsSection requests={requests} onCancel={(id) => cancelMutation.mutate(id)} />

      {pickerOpen && (
        <TargetPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSave={handleSaveTarget}
          isSaving={setTargetMutation.isPending}
        />
      )}
    </div>
  );
}
