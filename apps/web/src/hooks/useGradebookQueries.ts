import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getStudentGradebook,
  createGrade,
  updateGrade,
  deleteGrade,
  type GradeInput,
  type GradebookGrade,
  type StudentGradebook,
} from "@/services/gradebookService";

const gradebookKey = (studentId: string) => ["gradebook", studentId] as const;

// ── formmaps#89: optimistic updates ─────────────────────────────────────────────
// Every gradebook write used to cost TWO sequential round trips before the table
// changed: the mutation, then an invalidate-driven refetch of the whole gradebook.
// The row now appears immediately and the refetch reconciles in the background.
//
// What is updated optimistically and what deliberately is NOT:
//
//   byYear  -> YES. These are the rows the user is looking at, and the change they
//              just made is fully known on the client.
//   gpa*    -> NO. GPA is computed server-side from a school's GpaConfiguration
//              (custom letter->points maps and weighted-level bonuses), so any
//              client-side guess would be wrong for any school with a non-default
//              scale. Showing a confidently wrong GPA is worse than showing a
//              stale one for 200ms. It reconciles on settle.
//
// Rollback restores a SNAPSHOT rather than refetching: a refetch on error is slower
// and, if the error was a network failure, may not resolve at all.

/** Bucket key the backend groups by — mirrors GradebookReader's null/empty handling. */
const yearKey = (academicYear: string | null | undefined) => academicYear || "Unknown";

/**
 * Apply a change to the cached gradebook's rows, leaving the server-computed GPA
 * fields untouched. Returns undefined when there is nothing cached, so the caller
 * can skip the optimistic step rather than inventing a gradebook.
 */
function patchCachedRows(
  current: StudentGradebook | undefined,
  change: (rows: GradebookGrade[]) => GradebookGrade[],
): StudentGradebook | undefined {
  if (!current) return undefined;
  const byYear: Record<string, GradebookGrade[]> = {};
  for (const [year, rows] of Object.entries(current.byYear)) {
    byYear[year] = change(rows);
  }
  return { ...current, byYear };
}

export function useStudentGradebook(studentId: string | null) {
  return useQuery({
    queryKey: ["gradebook", studentId],
    queryFn: () => getStudentGradebook(studentId as string),
    enabled: !!studentId,
    staleTime: 1000 * 30,
  });
}

// A grade change shifts everything derived from StudentGrade: this student's
// gradebook, their transcript/GPA/gaps/recommendations (student-detail keys all
// end with the studentId), class rankings, and graduation progress.
function useGradebookInvalidation(studentId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: gradebookKey(studentId) });
    qc.invalidateQueries({ queryKey: ["class-rankings"] });
    qc.invalidateQueries({ queryKey: ["graduation-progress"] });
    // Any student-scoped query (student-detail transcript/gpa/gaps, academic gaps, etc.)
    qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && (q.queryKey as unknown[]).includes(studentId) });
  };
}

/**
 * Shared optimistic scaffolding: cancel in-flight refetches (so a response already on
 * the wire cannot land on top of the optimistic value), snapshot, apply, and hand the
 * snapshot back for rollback.
 */
function useOptimisticGradebook(studentId: string) {
  const qc = useQueryClient();
  return async (apply: (current: StudentGradebook | undefined) => StudentGradebook | undefined) => {
    const key = gradebookKey(studentId);
    await qc.cancelQueries({ queryKey: key });
    const snapshot = qc.getQueryData<StudentGradebook>(key);
    const next = apply(snapshot);
    if (next) qc.setQueryData(key, next);
    return { snapshot };
  };
}

function useRollback(studentId: string) {
  const qc = useQueryClient();
  return (context: { snapshot?: StudentGradebook } | undefined) => {
    if (context?.snapshot) qc.setQueryData(gradebookKey(studentId), context.snapshot);
  };
}

export function useCreateGrade(studentId: string) {
  const invalidate = useGradebookInvalidation(studentId);
  const optimistic = useOptimisticGradebook(studentId);
  const rollback = useRollback(studentId);
  return useMutation({
    mutationFn: (input: GradeInput) => createGrade({ ...input, studentId }),
    onMutate: (input) =>
      optimistic((current) => {
        if (!current) return undefined;
        // Temporary id, replaced by the real row when the refetch lands. Prefixed so
        // it is obvious in a debugger that this row is not yet persisted, and so any
        // code keying off ids cannot mistake it for a server id.
        const pending: GradebookGrade = {
          id: `optimistic-${Date.now()}`,
          courseId: input.courseId ?? "",
          courseCode: input.courseCode ?? null,
          grade: input.grade,
          credits: input.credits ?? 0,
          courseLevel: input.courseLevel ?? null,
          semester: input.semester ?? null,
          academicYear: input.academicYear ?? null,
          status: "completed",
        };
        const year = yearKey(input.academicYear);
        return { ...current, byYear: { ...current.byYear, [year]: [...(current.byYear[year] ?? []), pending] } };
      }),
    onError: (_err, _input, context) => { rollback(context); toast.error("Failed to add grade"); },
    onSuccess: () => toast.success("Grade added"),
    // Reconciles the real id and the server-computed GPA either way.
    onSettled: () => invalidate(),
  });
}

export function useUpdateGrade(studentId: string) {
  const invalidate = useGradebookInvalidation(studentId);
  const optimistic = useOptimisticGradebook(studentId);
  const rollback = useRollback(studentId);
  return useMutation({
    mutationFn: ({ gradeId, input }: { gradeId: string; input: Partial<GradeInput> }) => updateGrade(gradeId, input),
    onMutate: ({ gradeId, input }) =>
      optimistic((current) =>
        patchCachedRows(current, (rows) =>
          rows.map((r) => (r.id === gradeId ? { ...r, ...input, credits: input.credits ?? r.credits } : r)),
        ),
      ),
    onError: (_err, _vars, context) => { rollback(context); toast.error("Failed to update grade"); },
    onSuccess: () => toast.success("Grade updated"),
    onSettled: () => invalidate(),
  });
}

export function useDeleteGrade(studentId: string) {
  const invalidate = useGradebookInvalidation(studentId);
  const optimistic = useOptimisticGradebook(studentId);
  const rollback = useRollback(studentId);
  return useMutation({
    mutationFn: (gradeId: string) => deleteGrade(gradeId),
    onMutate: (gradeId) =>
      optimistic((current) => patchCachedRows(current, (rows) => rows.filter((r) => r.id !== gradeId))),
    onError: (_err, _gradeId, context) => { rollback(context); toast.error("Failed to delete grade"); },
    onSuccess: () => toast.success("Grade deleted"),
    onSettled: () => invalidate(),
  });
}
