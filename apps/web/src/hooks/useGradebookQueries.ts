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

// All grade mutations invalidate the student's gradebook + class rankings
// (a grade change shifts GPA and therefore ranks).
function useGradebookInvalidation(studentId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: gradebookKey(studentId) });
    qc.invalidateQueries({ queryKey: ["class-rankings"] });
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
