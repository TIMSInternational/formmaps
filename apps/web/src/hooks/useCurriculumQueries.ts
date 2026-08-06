"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryFilters,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getFrameworks,
  updateFrameworks,
  getFrameworkCourses,
  updateFrameworkCourse,
  getSchoolCourses,
  getAvailableCourses,
  createSchoolCourse,
  updateSchoolCourse,
  deleteSchoolCourse,
  importSchoolCourses,
  updatePrerequisites,
  checkPrerequisites,
  getPrerequisiteChain,
  recognizeCourses,
  recognizeAllUnmapped,
  applyAIMapping,
  analyzePrerequisites,
  applyPrereqSuggestions,
  getMyCourseEligibility,
  getCoursePathways,
} from "@/services/curriculumService";
import type { PrereqApplyUpdate } from "@/types/prereq";
import type {
  CurriculumFramework,
  FrameworkTogglePayload,
  FrameworkCourseOverride,
  SchoolCourse,
  SchoolCoursePayload,
  SchoolCoursesResponse,
  PrerequisitePayload,
  AIMappingAction,
} from "@/types/curriculum";
import {
  keyParams,
  optimisticId,
  patchBy,
  patchEnvelope,
  removeBy,
  useOptimisticCache,
} from "./useOptimisticCache";

// ============================================
// Query Keys
// ============================================

export const curriculumKeys = {
  all: ["curriculum"] as const,
  frameworks: () => [...curriculumKeys.all, "frameworks"] as const,
  frameworkCourses: (type: string, params?: object) =>
    [...curriculumKeys.all, "framework-courses", type, params] as const,
  schoolCourses: () => [...curriculumKeys.all, "school-courses"] as const,
  schoolCourseList: (params?: object) =>
    [...curriculumKeys.schoolCourses(), "list", params] as const,
  availableCourses: (params?: object) =>
    [...curriculumKeys.all, "available-courses", params] as const,
  prerequisites: (courseId: string) =>
    [...curriculumKeys.all, "prerequisites", courseId] as const,
  prerequisiteChain: (courseId: string) =>
    [...curriculumKeys.all, "prerequisite-chain", courseId] as const,
  prerequisiteCheck: (courseId: string, studentId: string) =>
    [...curriculumKeys.all, "prerequisite-check", courseId, studentId] as const,
  pathways: () => [...curriculumKeys.all, "pathways"] as const,
  aiRecognition: () => [...curriculumKeys.all, "ai-recognition"] as const,
};

// ── formmaps#89: optimistic curriculum writes ───────────────────────────────────
// Every write in this file used to cost TWO sequential round trips before the catalog
// changed: the mutation, then an invalidate-driven refetch of the whole course list.
// The rows the user is looking at now change immediately and the refetch reconciles in
// the background. The general rules live in useOptimisticCache.ts.
//
// This file's endpoints answer with almost nothing — POST /courses echoes { id, code },
// PUT /courses/:id echoes { id }, and the prerequisite/framework writes echo
// { success: true } — so unlike the notes hooks there is nothing to `replace` a row
// with, and the invalidate on settle stays. What #89 buys here is the wait, not the
// round trip.
//
// FIVE of the twelve mutations are optimistic (frameworks toggle, course
// create/update/delete, prerequisite edit). The other seven deliberately are NOT, each
// for a reason recorded at the hook itself; the short version:
//
//   useUpdateFrameworkCourse   -> the framework-course list is a GLOBAL catalog read
//                                 that never reflects a school's override, so a patch
//                                 would show a change the next fetch erases.
//   useImportSchoolCourses     -> rows are parsed and created server-side, asynchronously.
//   useRecognizeCourses        -> AI output.
//   useRecognizeAllUnmapped    -> AI output.
//   useApplyAIMapping          -> what "approve" writes onto the row is not verifiable
//                                 from this repo (route is legacy-Node only).
//   useAnalyzePrerequisites    -> touches no cache at all.
//   useApplyPrereqSuggestions  -> the outcome the user reads is a server-computed count.

/**
 * Every cached view of the course catalog: the school-admin list (all pages, all
 * filters) AND the student-facing one. They are the SAME rows read through two
 * endpoints, so a write that patches one and invalidates only the other leaves stale
 * data on screen — which is what the pre-#89 hooks did (`schoolCourses()` only).
 *
 * Written as a predicate rather than two prefixes so the cancel, the patch, the
 * rollback and the invalidate cannot drift apart: they are all this one filter.
 */
const courseListFilter: QueryFilters = {
  predicate: (query) => {
    const [root, section] = query.queryKey as unknown[];
    return root === "curriculum" && (section === "school-courses" || section === "available-courses");
  },
};

/** The trailing params object a course-list key carries. */
type CourseListParams = {
  page?: number;
  search?: string;
  department?: string;
  frameworkType?: string;
  gradeLevel?: number;
};

/**
 * A framework-catalog row folded into the course list by the API. They are appended
 * AFTER the paginated school-course rows and are not paginated themselves, so the
 * "sorted by code" ordering only holds across the leading school-course block.
 */
const isFrameworkRow = (course: SchoolCourse) =>
  (course as { isFrameworkCourse?: boolean }).isFrameworkCourse === true;

/**
 * Insert `course` into one cached page of the catalog at the position the server would
 * put it, or return undefined to decline the page.
 *
 * Two reasons to decline, both of them "the row would appear and then vanish":
 *
 *  1. ANY filtered view. The list filters on search/department/gradeLevel server-side
 *     (ILIKE over code+name, exact department, gradeLevel membership) and reproducing
 *     that here to decide whether a brand-new course matches is a guess that shows a
 *     row the refetch removes. Declining costs one unfiltered-list refresh of delay.
 *  2. A page the row does not sort onto. The list is ordered by code ASC across ALL
 *     pages, so a code past the end of a non-final page belongs on a later one, and a
 *     code before the start of a page after the first belongs on an earlier one.
 */
function insertIntoCoursePage(
  current: SchoolCoursesResponse,
  key: QueryKey,
  course: SchoolCourse,
): SchoolCoursesResponse | undefined {
  const params = keyParams<CourseListParams>(key);
  if (params.search || params.department || params.frameworkType || params.gradeLevel) return undefined;

  const rows = current.data ?? [];
  const frameworkTail = rows.findIndex(isFrameworkRow);
  const owned = frameworkTail === -1 ? rows : rows.slice(0, frameworkTail);
  // JS string order, not Postgres collation — close enough for the moment the row is
  // unreconciled, and course codes here are ASCII.
  const at = owned.findIndex((c) => c.code.localeCompare(course.code) > 0);

  const page = params.page ?? 1;
  if (at === -1 && page < (current.totalPages ?? 1)) return undefined;  // sorts past this page
  if (at === 0 && page > 1) return undefined;                           // sorts before this page

  const index = at === -1 ? owned.length : at;
  return patchEnvelope(current, (list) => [...list.slice(0, index), course, ...list.slice(index)]);
}

// ============================================
// Curriculum Framework Hooks (SCRUM-131)
// ============================================

export function useFrameworks() {
  return useQuery({
    queryKey: curriculumKeys.frameworks(),
    queryFn: getFrameworks,
    staleTime: 1000 * 60 * 10,
  });
}

export function useUpdateFrameworks() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (data: FrameworkTogglePayload) => updateFrameworks(data),

    // The toggle is a switch: the caller sends the whole framework list with the new
    // enabled flags, so the visible change is entirely client-known. `configuredAt` is
    // deliberately left alone — the server stamps it with its own now() on both the
    // insert and the update branch, and `courseCount` does not move at all.
    onMutate: (data) =>
      optimistic.patch<CurriculumFramework[]>({ queryKey: curriculumKeys.frameworks() }, (current) => {
        const enabledByType = new Map(data.frameworks.map((f) => [f.type, f.enabled]));
        return current.map((f) =>
          enabledByType.has(f.type) ? { ...f, enabled: enabledByType.get(f.type)! } : f,
        );
      }),

    onError: (_err, _data, context) => optimistic.rollback(context),

    // The PUT answers { success: true } — no rows — so the frameworks list still has to
    // be refetched. The course lists go with it: the catalog response folds in the
    // framework courses of every ENABLED framework, so a toggle adds or removes rows
    // from a list this hook never used to invalidate.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.frameworks() });
      queryClient.invalidateQueries(courseListFilter);
    },
  });
}

export function useFrameworkCourses(
  type: string,
  params?: { page?: number; limit?: number; search?: string }
) {
  return useQuery({
    queryKey: curriculumKeys.frameworkCourses(type, params),
    queryFn: () => getFrameworkCourses(type, params),
    enabled: !!type,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * #89 SKIPPED, deliberately: no optimistic update here.
 *
 * This PUT writes a per-school override row and answers with the merged course, but the
 * list it would be shown in (`GET /curriculum/frameworks/:type/courses`) is a GLOBAL
 * catalog read — it resolves no school and joins no override, so it returns the
 * un-overridden row and carries no `isCustomized` field at all. Patching the cached
 * list would show an edit that the very next fetch erases, which is worse than showing
 * it a beat late. Left invalidating the whole `curriculum` namespace for the same
 * reason: without a read that reflects the override, there is nothing narrower to aim at.
 */
export function useUpdateFrameworkCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      type,
      courseId,
      payload,
    }: {
      type: string;
      courseId: string;
      payload: FrameworkCourseOverride;
    }) => updateFrameworkCourse(type, courseId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.all });
    },
  });
}

// ============================================
// School Course Hooks (SCRUM-135)
// ============================================

export function useSchoolCourses(params?: {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
  frameworkType?: string;
  gradeLevel?: number;
}) {
  return useQuery({
    queryKey: curriculumKeys.schoolCourseList(params),
    queryFn: () => getSchoolCourses(params),
    staleTime: 1000 * 60 * 5,
  });
}

/** Student/public-accessible course list (no admin role required) */
export function useAvailableCourses(params?: {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
}) {
  return useQuery({
    queryKey: curriculumKeys.availableCourses(params),
    queryFn: () => getAvailableCourses(params),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateSchoolCourse() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (data: SchoolCoursePayload) => createSchoolCourse(data),

    onMutate: async (data) => {
      const pendingId = optimisticId();
      const pending: SchoolCourse = {
        id: pendingId,
        code: data.code,
        name: data.name,
        department: data.department,
        credits: data.credits,
        gradeLevels: data.gradeLevels,
        prerequisites: data.prerequisites ?? [],
        corequisites: data.corequisites ?? [],
        frameworkType: data.frameworkType,
        description: data.description,
        maxEnrollment: data.maxEnrollment ?? null,
        isHonors: data.isHonors ?? false,
        // Not guesses: the insert names no `status` so the column default ('active')
        // applies, and a course created a millisecond ago has nobody enrolled.
        enrollmentCount: 0,
        status: "active",
      };

      const context = await optimistic.patch<SchoolCoursesResponse>(courseListFilter, (current, key) =>
        insertIntoCoursePage(current, key, pending),
      );
      return { ...context, pendingId };
    },

    onSuccess: (created, _data, context) => {
      // The POST answers { id, code } and nothing else, so this MERGES rather than
      // substitutes — substituting would leave a row with a name, department and credits
      // of undefined until the refetch landed. Matched on the placeholder id, since the
      // server id is exactly what the row does not have yet.
      optimistic.replace<SchoolCoursesResponse>(courseListFilter, (current) => ({
        ...current,
        data: patchBy(current.data, (c) => c.id === context?.pendingId, (c) => ({ ...c, ...created })),
      }));
    },

    onError: (_err, _data, context) => optimistic.rollback(context),

    // Still invalidates: the response carries no server-side row, and on a filtered or
    // out-of-range page the optimistic insert declined entirely.
    onSettled: () => queryClient.invalidateQueries(courseListFilter),
  });
}

export function useUpdateSchoolCourse() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({
      courseId,
      payload,
    }: {
      courseId: string;
      payload: Partial<SchoolCoursePayload>;
    }) => updateSchoolCourse(courseId, payload),

    // Reaches every cached page and filter: an edited course could be sitting in any of
    // them, and on the pages that do not hold it the patch is a no-op.
    onMutate: ({ courseId, payload }) =>
      optimistic.patch<SchoolCoursesResponse>(courseListFilter, (current) =>
        patchEnvelope(current, (rows) =>
          patchBy(rows, (c) => c.id === courseId, (c) => ({ ...c, ...payload })),
        ),
      ),

    onError: (_err, _vars, context) => optimistic.rollback(context),

    // The PUT answers { id } only — nothing to replace with — and an edited `code` can
    // move the row to another page, which only a refetch can resolve.
    onSettled: () => queryClient.invalidateQueries(courseListFilter),
  });
}

export function useDeleteSchoolCourse() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (courseId: string) => deleteSchoolCourse(courseId),

    onMutate: (courseId) =>
      optimistic.patch<SchoolCoursesResponse>(courseListFilter, (current) =>
        patchEnvelope(current, (rows) => removeBy(rows, (c) => c.id === courseId)),
      ),

    // The rollback that matters most in this file: the endpoint 403s on a course that
    // is not in the caller's school, and a course that vanishes and stays vanished
    // after a rejected delete reads as data loss.
    onError: (_err, _courseId, context) => optimistic.rollback(context),

    onSettled: () => {
      queryClient.invalidateQueries(courseListFilter);
      // A deleted course drops out of the prereq graph the pathway view is drawn from.
      queryClient.invalidateQueries({ queryKey: curriculumKeys.pathways() });
    },
  });
}

/**
 * #89 SKIPPED, deliberately: no optimistic update here.
 *
 * The uploaded file is parsed server-side and the rows are created by a background job
 * (see useImportJobPolling) — the client knows neither which rows will be accepted nor
 * what ids they will get, and the immediate response is a validation summary, not a
 * catalog. Both catalog views are invalidated so the student-facing list reconciles too.
 */
export function useImportSchoolCourses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importSchoolCourses(file),
    onSuccess: () => {
      queryClient.invalidateQueries(courseListFilter);
    },
  });
}

// ============================================
// Prerequisite Hooks (SCRUM-137)
// ============================================

export function useUpdatePrerequisites() {
  const queryClient = useQueryClient();
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({
      courseId,
      payload,
    }: {
      courseId: string;
      payload: PrerequisitePayload;
    }) => updatePrerequisites(courseId, payload),

    // The payload names prerequisites by course ID, but the row displays them as CODES:
    // the write resolves `prerequisiteRules[].courseIds` against this school's catalog
    // and stores the codes it found, ordered by id. Resolve them the same way, from the
    // very catalog entry being patched — the editor loads it as one 500-row page.
    onMutate: ({ courseId, payload }) =>
      optimistic.patch<SchoolCoursesResponse>(courseListFilter, (current) => {
        const rows = current.data ?? [];
        const byId = new Map(rows.map((c) => [c.id, c]));
        const ids = [...new Set(payload.prerequisiteRules.flatMap((rule) => rule.courseIds))].sort();
        // A prerequisite this entry cannot name is a prerequisite that would be dropped
        // from the row — which reads as data loss on a save that actually succeeded.
        // Decline the entry instead; the invalidate below still reconciles it.
        if (ids.some((id) => !byId.has(id))) return undefined;
        const codes = ids.map((id) => byId.get(id)!.code);
        return patchEnvelope(current, (list) =>
          patchBy(list, (c) => c.id === courseId, (c) => ({
            ...c,
            // Both columns are REPLACED wholesale by this endpoint, not merged.
            prerequisites: codes,
            corequisites: payload.corequisites,
          })),
        );
      }),

    onError: (_err, _vars, context) => optimistic.rollback(context),

    // Everything derived from a prerequisite edge is server-computed and none of it is
    // faked above: the chain and its depth, the per-student eligibility check, the
    // pathway graph. Invalidating the whole curriculum namespace (rather than just
    // school-courses + pathways, which left `usePrerequisiteChain` stale) is the same
    // reasoning useApplyPrereqSuggestions already used.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.all });
      queryClient.invalidateQueries({ queryKey: ["course-eligibility"] });
    },
  });
}

export function usePrerequisiteCheck(courseId: string, studentId: string) {
  return useQuery({
    queryKey: curriculumKeys.prerequisiteCheck(courseId, studentId),
    queryFn: () => checkPrerequisites(courseId, studentId),
    enabled: !!courseId && !!studentId,
    staleTime: 1000 * 60 * 5,
  });
}

export function usePrerequisiteChain(courseId: string | null) {
  return useQuery({
    queryKey: curriculumKeys.prerequisiteChain(courseId || ""),
    queryFn: () => getPrerequisiteChain(courseId!),
    enabled: !!courseId,
    staleTime: 1000 * 60 * 10,
  });
}

// ============================================
// AI Recognition Hooks (SCRUM-136)
// ============================================

/**
 * #89 SKIPPED, deliberately: no optimistic update here (and none in
 * useRecognizeAllUnmapped below).
 *
 * The entire result is AI output — equivalent codes, confidence scores, reasoning. There
 * is no client-side approximation of it to show, only a wait.
 */
export function useRecognizeCourses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (courseIds: string[]) => recognizeCourses(courseIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.aiRecognition() });
    },
  });
}

export function useRecognizeAllUnmapped() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recognizeAllUnmapped,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.aiRecognition() });
    },
  });
}

/**
 * #89 SKIPPED, deliberately: no optimistic update here.
 *
 * Approving a mapping plausibly stamps `frameworkType` onto the course row — but this
 * route exists only in the legacy Node service, is not in this repo, and answers with
 * no body, so what it actually writes (the framework link, an equivalence row, both,
 * neither on "reject") cannot be confirmed. Showing a mapping the server did not make
 * is worse than showing it one refetch late, so the invalidate stays.
 */
export function useApplyAIMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      courseId,
      payload,
    }: {
      courseId: string;
      payload: AIMappingAction;
    }) => applyAIMapping(courseId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries(courseListFilter);
      queryClient.invalidateQueries({ queryKey: curriculumKeys.aiRecognition() });
    },
  });
}

// ─── Course pathways (derived from the prereq graph) ─────────────────────────

export function useCoursePathways() {
  return useQuery({
    queryKey: curriculumKeys.pathways(),
    queryFn: getCoursePathways,
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Prerequisite analysis + eligibility ─────────────────────────────────────

/**
 * #89 SKIPPED, deliberately: nothing to be optimistic about. This mutation writes
 * nothing and touches no cache — it asks the server to compute suggestions and hands
 * them straight to the dialog that called it.
 */
export function useAnalyzePrerequisites() {
  return useMutation({
    mutationFn: analyzePrerequisites,
    onError: () => toast.error("Prerequisite analysis failed — try again"),
  });
}

/**
 * #89 SKIPPED, deliberately: no optimistic update here.
 *
 * The thing the user actually reads back is `updated` — a server-computed count of how
 * many courses the apply touched — and the apply route is legacy-Node only, so whether
 * it unions, replaces, case-normalises or silently drops a code that resolves to no
 * course is not verifiable from this repo. Every one of those differences would show
 * the wrong prerequisite list on the row the user just edited. Compare
 * useUpdatePrerequisites above, where the write's resolution rule IS readable.
 */
export function useApplyPrereqSuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: PrereqApplyUpdate[]) => applyPrereqSuggestions(updates),
    onSuccess: (res) => {
      // Prereq edges feed the catalog AND the chain/check/eligibility views —
      // invalidate the whole curriculum namespace to keep them coherent.
      queryClient.invalidateQueries({ queryKey: curriculumKeys.all });
      queryClient.invalidateQueries({ queryKey: ["course-eligibility"] });
      toast.success(`${res.updated} ${res.updated === 1 ? "course" : "courses"} updated`);
    },
    onError: () => toast.error("Failed to apply prerequisites"),
  });
}

export function useMyCourseEligibility(enabled = true) {
  return useQuery({
    queryKey: ["course-eligibility", "me"],
    queryFn: getMyCourseEligibility,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
