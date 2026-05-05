"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCourseSequences,
  getCourseSequenceDetail,
  createCourseSequence,
  updateCourseSequence,
  deleteCourseSequence,
  assignSequenceToStudents,
  getStudentCourseSequence,
  generateCourseSequenceAI,
} from "@/services/courseSequenceService";
import type { CourseSequencePayload } from "@/types/curriculum";

// ============================================
// Query Keys
// ============================================

export const courseSequenceKeys = {
  all: ["course-sequences"] as const,
  list: (params?: object) => [...courseSequenceKeys.all, "list", params] as const,
  detail: (id: string) => [...courseSequenceKeys.all, "detail", id] as const,
  studentSequence: (studentId: string) =>
    [...courseSequenceKeys.all, "student", studentId] as const,
};

// ============================================
// Course Sequence Hooks (SCRUM-138)
// ============================================

export function useCourseSequences(params?: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  return useQuery({
    queryKey: courseSequenceKeys.list(params),
    queryFn: () => getCourseSequences(params),
    staleTime: 0,
  });
}

export function useCourseSequenceDetail(id: string) {
  return useQuery({
    queryKey: courseSequenceKeys.detail(id),
    queryFn: () => getCourseSequenceDetail(id),
    enabled: !!id && id !== "new",
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateCourseSequence() {
  return useMutation({
    mutationFn: (data: CourseSequencePayload) => createCourseSequence(data),
  });
}

export function useUpdateCourseSequence() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CourseSequencePayload> }) =>
      updateCourseSequence(id, payload),
  });
}

export function useDeleteCourseSequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCourseSequence(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseSequenceKeys.all });
    },
  });
}

export function useAssignSequenceToStudents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sequenceId,
      studentIds,
    }: {
      sequenceId: string;
      studentIds: string[];
    }) => assignSequenceToStudents(sequenceId, studentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseSequenceKeys.all });
    },
  });
}

export function useStudentCourseSequence(studentId: string) {
  return useQuery({
    queryKey: courseSequenceKeys.studentSequence(studentId),
    queryFn: () => getStudentCourseSequence(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useGenerateCourseSequenceAI() {
  return useMutation({
    mutationFn: (payload: { file?: File; prompt?: string }) => generateCourseSequenceAI(payload),
  });
}
