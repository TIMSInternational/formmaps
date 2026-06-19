import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getStudentGradebook,
  createGrade,
  updateGrade,
  deleteGrade,
  type GradeInput,
} from "@/services/gradebookService";

const gradebookKey = (studentId: string) => ["gradebook", studentId] as const;

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

export function useCreateGrade(studentId: string) {
  const invalidate = useGradebookInvalidation(studentId);
  return useMutation({
    mutationFn: (input: GradeInput) => createGrade({ ...input, studentId }),
    onSuccess: () => { invalidate(); toast.success("Grade added"); },
    onError: () => toast.error("Failed to add grade"),
  });
}

export function useUpdateGrade(studentId: string) {
  const invalidate = useGradebookInvalidation(studentId);
  return useMutation({
    mutationFn: ({ gradeId, input }: { gradeId: string; input: Partial<GradeInput> }) => updateGrade(gradeId, input),
    onSuccess: () => { invalidate(); toast.success("Grade updated"); },
    onError: () => toast.error("Failed to update grade"),
  });
}

export function useDeleteGrade(studentId: string) {
  const invalidate = useGradebookInvalidation(studentId);
  return useMutation({
    mutationFn: (gradeId: string) => deleteGrade(gradeId),
    onSuccess: () => { invalidate(); toast.success("Grade deleted"); },
    onError: () => toast.error("Failed to delete grade"),
  });
}
