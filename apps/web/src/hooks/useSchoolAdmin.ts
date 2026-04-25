"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSchoolAdminStats,
  getStudents,
  getStudent,
  inviteStudent,
  bulkInviteStudents,
  resendStudentInvite,
  removeStudent,
  getAnalyticsOverview,
  getPerformanceTrends,
  getTopPerformers,
  getStudentResults,
  getStudentDetailResult,
  getSchoolSettings,
} from "@/services/schoolAdminService";
import { StudentInvitePayload, BulkStudentInvitePayload } from "@/types/student";

// ============================================
// Query Keys
// ============================================

export const schoolAdminKeys = {
  all: ["school-admin"] as const,
  stats: () => [...schoolAdminKeys.all, "stats"] as const,
  students: () => [...schoolAdminKeys.all, "students"] as const,
  studentList: (params: any) => [...schoolAdminKeys.students(), "list", params] as const,
  analytics: () => [...schoolAdminKeys.all, "analytics"] as const,
  analyticsOverview: (period: string) => [...schoolAdminKeys.analytics(), "overview", period] as const,
  performanceTrends: (period: string, metric: string) => [...schoolAdminKeys.analytics(), "trends", period, metric] as const,
  topPerformers: (limit: number) => [...schoolAdminKeys.analytics(), "top-performers", limit] as const,
  results: () => [...schoolAdminKeys.all, "results"] as const,
  resultList: (params: any) => [...schoolAdminKeys.results(), "list", params] as const,
  studentDetail: (studentId: string) => [...schoolAdminKeys.results(), "student", studentId] as const,
  settings: () => [...schoolAdminKeys.all, "settings"] as const,
};

// ============================================
// Dashboard Stats Hook
// ============================================

export function useSchoolAdminStats() {
  return useQuery({
    queryKey: schoolAdminKeys.stats(),
    queryFn: getSchoolAdminStats,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ============================================
// Student Hooks
// ============================================

export function useStudents(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
} = {}) {
  return useQuery({
    queryKey: schoolAdminKeys.studentList(params),
    queryFn: () => getStudents(params),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

export function useStudent(studentId: string) {
  return useQuery({
    queryKey: [...schoolAdminKeys.students(), "detail", studentId],
    queryFn: () => getStudent(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useInviteStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StudentInvitePayload) => inviteStudent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolAdminKeys.students() });
      queryClient.invalidateQueries({ queryKey: schoolAdminKeys.stats() });
    },
  });
}

export function useBulkInviteStudents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkStudentInvitePayload) => bulkInviteStudents(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolAdminKeys.students() });
      queryClient.invalidateQueries({ queryKey: schoolAdminKeys.stats() });
    },
  });
}

export function useResendStudentInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (studentId: string) => resendStudentInvite(studentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolAdminKeys.students() });
    },
  });
}

export function useRemoveStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (studentId: string) => removeStudent(studentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolAdminKeys.students() });
      queryClient.invalidateQueries({ queryKey: schoolAdminKeys.stats() });
    },
  });
}

// ============================================
// Analytics Hooks
// ============================================

export function useAnalyticsOverview(period: "week" | "month" | "quarter" | "year" = "month") {
  return useQuery({
    queryKey: schoolAdminKeys.analyticsOverview(period),
    queryFn: () => getAnalyticsOverview(period),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function usePerformanceTrends(
  period: "week" | "month" | "quarter" | "year" = "month",
  metric: "score" | "completion" | "time" = "score"
) {
  return useQuery({
    queryKey: schoolAdminKeys.performanceTrends(period, metric),
    queryFn: () => getPerformanceTrends(period, metric),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function useTopPerformers(limit: number = 10) {
  return useQuery({
    queryKey: schoolAdminKeys.topPerformers(limit),
    queryFn: () => getTopPerformers(limit),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

// ============================================
// Results Hooks
// ============================================

export function useStudentResults(params: {
  page?: number;
  limit?: number;
  studentId?: string;
  assessmentType?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}) {
  return useQuery({
    queryKey: schoolAdminKeys.resultList(params),
    queryFn: () => getStudentResults(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useStudentDetailResult(studentId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: schoolAdminKeys.studentDetail(studentId),
    queryFn: () => getStudentDetailResult(studentId),
    enabled: enabled && !!studentId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ============================================
// Settings Hook
// ============================================

export function useSchoolSettings() {
  return useQuery({
    queryKey: schoolAdminKeys.settings(),
    queryFn: getSchoolSettings,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}
