"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getStudentAcademicGaps,
  getAcademicGapSummary,
  getStudentCourseRecommendations,
} from "@/services/academicGapService";

// ============================================
// Query Keys
// ============================================

export const academicGapKeys = {
  all: ["academic-gaps"] as const,
  studentGaps: (studentId: string) =>
    [...academicGapKeys.all, "student", studentId] as const,
  summary: (params?: object) =>
    [...academicGapKeys.all, "summary", params] as const,
  recommendations: (studentId: string) =>
    [...academicGapKeys.all, "recommendations", studentId] as const,
};

// ============================================
// Academic Gap Hooks (SCRUM-139/140)
// ============================================

export function useStudentAcademicGaps(studentId: string) {
  return useQuery({
    queryKey: academicGapKeys.studentGaps(studentId),
    queryFn: () => getStudentAcademicGaps(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useAcademicGapSummary(params?: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: academicGapKeys.summary(params),
    queryFn: () => getAcademicGapSummary(params),
    staleTime: 1000 * 60 * 5,
  });
}

export function useStudentCourseRecommendations(studentId: string) {
  return useQuery({
    queryKey: academicGapKeys.recommendations(studentId),
    queryFn: () => getStudentCourseRecommendations(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 10,
  });
}
