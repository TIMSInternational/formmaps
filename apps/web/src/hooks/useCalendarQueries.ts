"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,
  getAssessmentPeriods,
  createAssessmentPeriod,
  updateAssessmentPeriod,
  deleteAssessmentPeriod,
  getHolidays,
  createHolidays,
  deleteHoliday,
} from "@/services/calendarService";
import type {
  AcademicYearPayload,
  AssessmentPeriodPayload,
  HolidayPayload,
} from "@/types/calendar";

// ============================================
// Query Keys
// ============================================

export const calendarKeys = {
  all: ["calendar"] as const,
  academicYears: () => [...calendarKeys.all, "academic-years"] as const,
  assessmentPeriods: () => [...calendarKeys.all, "assessment-periods"] as const,
  holidays: () => [...calendarKeys.all, "holidays"] as const,
};

// ============================================
// Academic Year Hooks
// ============================================

export function useAcademicYears() {
  return useQuery({
    queryKey: calendarKeys.academicYears(),
    queryFn: getAcademicYears,
    staleTime: 1000 * 60 * 30,
  });
}

export function useCreateAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AcademicYearPayload) => createAcademicYear(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.academicYears() });
    },
  });
}

export function useUpdateAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<AcademicYearPayload> }) =>
      updateAcademicYear(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.academicYears() });
    },
  });
}

export function useDeleteAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAcademicYear(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.academicYears() });
    },
  });
}

// ============================================
// Assessment Period Hooks
// ============================================

export function useAssessmentPeriods() {
  return useQuery({
    queryKey: calendarKeys.assessmentPeriods(),
    queryFn: getAssessmentPeriods,
    staleTime: 1000 * 60 * 30,
  });
}

export function useCreateAssessmentPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AssessmentPeriodPayload) => createAssessmentPeriod(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.assessmentPeriods() });
    },
  });
}

export function useUpdateAssessmentPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<AssessmentPeriodPayload> }) =>
      updateAssessmentPeriod(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.assessmentPeriods() });
    },
  });
}

export function useDeleteAssessmentPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAssessmentPeriod(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.assessmentPeriods() });
    },
  });
}

// ============================================
// Holiday Hooks
// ============================================

export function useHolidays() {
  return useQuery({
    queryKey: calendarKeys.holidays(),
    queryFn: getHolidays,
    staleTime: 1000 * 60 * 30,
  });
}

export function useCreateHolidays() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HolidayPayload) => createHolidays(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.holidays() });
    },
  });
}

export function useDeleteHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHoliday(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.holidays() });
    },
  });
}
