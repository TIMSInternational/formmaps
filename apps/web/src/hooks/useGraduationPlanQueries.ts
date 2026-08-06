"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getGraduationTarget,
  setGraduationTarget,
  generateGraduationPlan,
  getMyGraduationPlan,
  submitGraduationPlan,
  discardGraduationDraft,
  getSupplementalCourses,
  getStudentGraduationPlan,
  counselorGenerateGraduationPlan,
  reviewGraduationPlan,
  getChildCoursePlan,
} from "@/services/graduationPlanService";
import { coursePlanKeys } from "@/hooks/useCoursePlanQueries";
import {
  getPlanErrorCode,
  isLockedResult,
  type GraduationPlan,
  type GraduationTarget,
  type SetGraduationTargetPayload,
  type ReviewGraduationPlanPayload,
  type StudentGraduationPlanResponse,
} from "@/types/graduationPlan";
import { useOptimisticCache, type CacheSnapshot } from "./useOptimisticCache";

// ── formmaps#89: optimistic graduation-plan writes ──────────────────────────────
//
// Four of this file's six mutations now patch the cache before the server answers:
// setting the target, submitting a draft, discarding a draft, and a counselor's
// review. Each of those is a state change the client already knows in full — a status
// moving from "draft" to "proposed", a draft going away — so the card the user just
// clicked reacts at once instead of after two sequential round trips.
//
// The two PLAN GENERATORS are deliberately left pessimistic. See the comment on
// `useGenerateGraduationPlan`: a generated plan is server-computed from the school's
// ruleset, its catalog and the student's assessments, and a faked one would be a
// course sequence the student might act on.
//
// The general rules live in useOptimisticCache.ts.

export const graduationPlanKeys = {
  all: ["graduation-plan"] as const,
  target: () => [...graduationPlanKeys.all, "target"] as const,
  myPlan: () => [...graduationPlanKeys.all, "my-plan"] as const,
  supplemental: () => [...graduationPlanKeys.all, "supplemental"] as const,
  studentPlan: (studentId: string) =>
    [...graduationPlanKeys.all, "student", studentId] as const,
  childPlan: (studentId: string) =>
    [...graduationPlanKeys.all, "child", studentId] as const,
};

const PLAN_ERROR_COPY: Record<string, string> = {
  NO_TARGET: "Pick a graduation goal first.",
  NO_SCHOOL: "Graduation plans need a school account.",
  NO_CURRENT_YEAR: "Your school hasn't opened the current academic year yet.",
  NO_RULESET: "Your school hasn't published its graduation requirements yet.",
  NO_CATALOG: "Your school hasn't published its course catalog yet.",
  PLAN_PROPOSED: "Your plan is already with your counselor — regenerating will replace it.",
  NO_DRAFT: "There's no draft plan to act on.",
};

function planErrorMessage(err: unknown, fallback: string): string {
  const code = getPlanErrorCode(err);
  return (code && PLAN_ERROR_COPY[code]) || fallback;
}

// ─── Student ─────────────────────────────────────────────────────────────────

export function useGraduationTarget() {
  return useQuery({
    queryKey: graduationPlanKeys.target(),
    queryFn: getGraduationTarget,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetGraduationTarget() {
  const qc = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (payload: SetGraduationTargetPayload) => setGraduationTarget(payload),

    // Everything the page reads to answer "does this student have a goal yet" is in
    // the payload: the major, the university, and `suggested` — which flips false the
    // moment a target is saved by hand, and is what turns the Generate CTA on and the
    // side panel's button into "this is your graduation goal".
    //
    // What is NOT guessed: fieldKey, selectivityTier, templateKey and templateLabel.
    // The server derives those from the major and the university's selectivity tier,
    // and the label is rendered as the name of the student's path — a confidently
    // wrong one is worse than one that is 200ms late.
    onMutate: (payload) =>
      optimistic.patch<GraduationTarget | null>(
        { queryKey: graduationPlanKeys.target() },
        (current) => {
          // The two callers are mutually exclusive: the side panel passes a university
          // id and no name, the picker passes a free-text name and no id. Carrying the
          // previously cached name across a change of id would render the OLD school's
          // name against the NEW school's id, so it is dropped unless the id is the one
          // already cached (re-saving the same school with a different major).
          const sameUniversity =
            !!payload.universityId && payload.universityId === current?.universityId;
          return {
            ...(current ?? {}),
            universityId: payload.universityId ?? null,
            universityName:
              payload.universityName ?? (sameUniversity ? current!.universityName : null),
            major: payload.major,
            suggested: false,
          };
        },
      ),

    // The PUT answers with the saved target, but the derived fields above are exactly
    // what this hook refuses to guess — so the target is still reconciled rather than
    // adopted from the response. Supplemental courses are scored against the target
    // and go stale with it.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: graduationPlanKeys.target() });
      qc.invalidateQueries({ queryKey: graduationPlanKeys.supplemental() });
    },

    onSuccess: () => toast.success("Graduation goal saved"),
    onError: (_err, _payload, context) => {
      optimistic.rollback(context);
      toast.error("Failed to save your goal");
    },
  });
}

// NOT optimistic, deliberately.
//
// The response is a plan the SERVER computes: it walks the school's graduation
// ruleset and published catalog, weighs the student's assessment results, then picks
// courses, spreads them across grade levels and produces a gap report and a rationale.
// None of that is predictable on the client, and the same call can come back `locked`
// instead of a plan at all. A faked draft would be a course sequence the student might
// act on, replaced wholesale a moment later.
export function useGenerateGraduationPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { force?: boolean }) => generateGraduationPlan(opts),
    onSuccess: (result) => {
      if (isLockedResult(result)) {
        toast.info("Complete your assessments to unlock plan generation");
        return;
      }
      qc.invalidateQueries({ queryKey: graduationPlanKeys.all });
      toast.success("Draft plan generated");
    },
    onError: (err) => toast.error(planErrorMessage(err, "Failed to generate a plan")),
  });
}

export function useMyGraduationPlan() {
  return useQuery({
    queryKey: graduationPlanKeys.myPlan(),
    queryFn: getMyGraduationPlan,
    staleTime: 2 * 60 * 1000,
  });
}

export function useSubmitGraduationPlan() {
  const qc = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: submitGraduationPlan,

    // Submitting moves the status and nothing else the page renders — the draft's
    // items, credits and gap report are unchanged — so the status strip switches to
    // "Submitted, your counselor is reviewing this" without waiting.
    //
    // `submittedAt` is left alone: it is a server clock value, and nothing renders it
    // today, so there is no reason to stamp it with a client's skewed clock.
    onMutate: () =>
      optimistic.patch<GraduationPlan | null>(
        { queryKey: graduationPlanKeys.myPlan() },
        (current) => (current ? { ...current, status: "proposed" } : undefined),
      ),

    onSettled: () => {
      qc.invalidateQueries({ queryKey: graduationPlanKeys.myPlan() });
    },

    onSuccess: () => toast.success("Plan sent to your counselor for review"),
    onError: (err, _vars, context) => {
      optimistic.rollback(context);
      toast.error(planErrorMessage(err, "Failed to submit your plan"));
    },
  });
}

export function useDiscardGraduationDraft() {
  const qc = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: discardGraduationDraft,

    // The whole draft section is rendered from `myPlan` being non-null, so clearing
    // the entry is what makes it disappear on the click rather than a round trip later.
    //
    // Written against the query client instead of `optimistic.patch`: an updater there
    // returning a falsy value is coalesced back to the current one (`update(…) ??
    // current`) — that is how a hook declines an entry — so "this entry becomes null"
    // cannot be expressed through it. The snapshot is built in the helper's own shape
    // so the shared rollback still applies unchanged.
    onMutate: async () => {
      const key = graduationPlanKeys.myPlan();
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<GraduationPlan | null>(key);
      // Nothing cached, nothing to clear — and nothing to snapshot either.
      if (previous === undefined) return { snapshot: [] as CacheSnapshot };
      qc.setQueryData(key, null);
      const snapshot: CacheSnapshot = [[key, previous]];
      return { snapshot };
    },

    // Still reconciled: the read returns the student's current plan, and discarding one
    // draft can uncover an earlier one (`superseded` is a status this model has), which
    // is not something the client can work out for itself.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: graduationPlanKeys.myPlan() });
    },

    onSuccess: () => toast.success("Draft discarded"),
    onError: (_err, _vars, context) => {
      optimistic.rollback(context);
      toast.error("Failed to discard the draft");
    },
  });
}

export function useSupplementalCourses(enabled = true) {
  return useQuery({
    queryKey: graduationPlanKeys.supplemental(),
    queryFn: getSupplementalCourses,
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Counselor ───────────────────────────────────────────────────────────────

export function useStudentGraduationPlan(studentId?: string) {
  return useQuery({
    queryKey: graduationPlanKeys.studentPlan(studentId ?? ""),
    queryFn: () => getStudentGraduationPlan(studentId!),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

// NOT optimistic, for the same reason as the student's generator above — this is the
// same server-side generation run on a student's behalf.
export function useCounselorGeneratePlan(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { force?: boolean }) =>
      counselorGenerateGraduationPlan(studentId, opts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: graduationPlanKeys.studentPlan(studentId) });
      toast.success("Draft plan generated for student");
    },
    onError: (err) => toast.error(planErrorMessage(err, "Failed to generate a plan")),
  });
}

export function useReviewGraduationPlan(studentId: string) {
  const qc = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (payload: ReviewGraduationPlanPayload) =>
      reviewGraduationPlan(studentId, payload),

    // The review card renders only while the plan is "proposed", so patching the status
    // is what closes it on the click — approving and rejecting both leave the plan's
    // items alone, and the note is the counselor's own text.
    onMutate: (payload) =>
      optimistic.patch<StudentGraduationPlanResponse>(
        { queryKey: graduationPlanKeys.studentPlan(studentId) },
        (current) =>
          current.plan
            ? {
                ...current,
                plan: {
                  ...current.plan,
                  status: payload.status,
                  // Only when one was written: an approval carries no note, and
                  // blanking the field would erase the note from an earlier rejection
                  // that the server keeps.
                  ...(payload.note ? { reviewNote: payload.note } : {}),
                },
              }
            : undefined,
      ),

    onSuccess: (_data, payload) => {
      // Approval materializes current-grade rows into the official course plan.
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success(payload.status === "approved" ? "Plan approved" : "Plan rejected");
    },

    // The server stamps the review and, on approval, rewrites what the plan points at,
    // so the status patch is reconciled either way.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: graduationPlanKeys.studentPlan(studentId) });
    },

    onError: (_err, _payload, context) => {
      optimistic.rollback(context);
      toast.error("Failed to review the plan");
    },
  });
}

// ─── Parent ──────────────────────────────────────────────────────────────────

export function useChildCoursePlan(studentId?: string) {
  return useQuery({
    queryKey: graduationPlanKeys.childPlan(studentId ?? ""),
    queryFn: () => getChildCoursePlan(studentId!),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });
}
