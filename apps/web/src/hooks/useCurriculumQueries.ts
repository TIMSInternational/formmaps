"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "@/services/curriculumService";
import type {
  FrameworkTogglePayload,
  FrameworkCourseOverride,
  SchoolCoursePayload,
  PrerequisitePayload,
  AIMappingAction,
} from "@/types/curriculum";

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
  aiRecognition: () => [...curriculumKeys.all, "ai-recognition"] as const,
};

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
  return useMutation({
    mutationFn: (data: FrameworkTogglePayload) => updateFrameworks(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.frameworks() });
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
  return useMutation({
    mutationFn: (data: SchoolCoursePayload) => createSchoolCourse(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
    },
  });
}

export function useUpdateSchoolCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      courseId,
      payload,
    }: {
      courseId: string;
      payload: Partial<SchoolCoursePayload>;
    }) => updateSchoolCourse(courseId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
    },
  });
}

export function useDeleteSchoolCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => deleteSchoolCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
    },
  });
}

export function useImportSchoolCourses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importSchoolCourses(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
    },
  });
}

// ============================================
// Prerequisite Hooks (SCRUM-137)
// ============================================

export function useUpdatePrerequisites() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      courseId,
      payload,
    }: {
      courseId: string;
      payload: PrerequisitePayload;
    }) => updatePrerequisites(courseId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
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
      queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });
      queryClient.invalidateQueries({ queryKey: curriculumKeys.aiRecognition() });
    },
  });
}
