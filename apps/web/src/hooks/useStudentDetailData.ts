"use client";

import { useQuery } from "@tanstack/react-query";
import { getMILResults, getUserExamHistory } from "@/services/milService";
import { getUserEvaluationGroups, getEvaluationReport } from "@/services/evaluationService";
import { getStudentAcademicGaps, getStudentCourseRecommendations } from "@/services/academicGapService";
import { getStudentTranscript, getStudentGpa } from "@/services/transcriptService";
import type { MILResultsData } from "@/services/milService";
import type { StudentGpa, TranscriptData } from "@/services/transcriptService";

export const studentDetailKeys = {
  milResults: (id: string) => ["student-detail", "mil", id] as const,
  pcaHistory: (id: string) => ["student-detail", "pca", id] as const,
  evalGroups: (id: string) => ["student-detail", "eval-groups", id] as const,
  evalProgress: (id: string) => ["student-detail", "eval-progress", id] as const,
  academicGaps: (id: string) => ["student-detail", "gaps", id] as const,
  recommendations: (id: string) => ["student-detail", "recommendations", id] as const,
  transcript: (id: string) => ["student-detail", "transcript", id] as const,
  gpa: (id: string) => ["student-detail", "gpa", id] as const,
};

// All hooks use retry: false to avoid repeated toasts on 403/404
// and throwOnError: false so the page renders gracefully with empty data

export function useStudentMILResults(studentId: string) {
  return useQuery<MILResultsData | null>({
    queryKey: studentDetailKeys.milResults(studentId),
    queryFn: () => getMILResults(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}

export function useStudentPCAHistory(studentId: string) {
  return useQuery({
    queryKey: studentDetailKeys.pcaHistory(studentId),
    queryFn: () => getUserExamHistory(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}

export function useStudentEvalGroups(studentId: string) {
  return useQuery({
    queryKey: studentDetailKeys.evalGroups(studentId),
    queryFn: () => getUserEvaluationGroups(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}

export function useStudentEvalProgress(studentId: string) {
  return useQuery({
    queryKey: studentDetailKeys.evalProgress(studentId),
    queryFn: () => getEvaluationReport(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}

export function useStudentAcademicGaps(studentId: string) {
  return useQuery({
    queryKey: studentDetailKeys.academicGaps(studentId),
    queryFn: () => getStudentAcademicGaps(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}

export function useStudentRecommendations(studentId: string) {
  return useQuery({
    queryKey: studentDetailKeys.recommendations(studentId),
    queryFn: () => getStudentCourseRecommendations(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}

export function useStudentTranscript(studentId: string) {
  return useQuery<TranscriptData>({
    queryKey: studentDetailKeys.transcript(studentId),
    queryFn: () => getStudentTranscript(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}

export function useStudentGpa(studentId: string) {
  return useQuery<StudentGpa | null>({
    queryKey: studentDetailKeys.gpa(studentId),
    queryFn: () => getStudentGpa(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}
