"use client";

import { useQuery } from "@tanstack/react-query";
import { listCourses, getCourseById, getRecommendedCourses, getUserEnrollments } from "@/services/courseService";

export const courseKeys = {
  all: ["courses"] as const,
  list: (params?: Record<string, any>) =>
    [
      ...courseKeys.all,
      "list",
      params ? JSON.stringify(params) : "default",
    ] as const,
  recommended: () => [...courseKeys.all, "recommended"] as const,
  detail: (id: string) => [...courseKeys.all, "detail", id] as const,
};

export function useCourseList() {
  return useQuery({
    queryKey: courseKeys.list(),
    queryFn: () => listCourses(),
    staleTime: 2 * 60 * 1000,
  });
}

export function useRecommendedCourses() {
  return useQuery({
    queryKey: courseKeys.recommended(),
    queryFn: () => getRecommendedCourses(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCourseDetail(id?: string) {
  return useQuery({
    queryKey: courseKeys.detail(id ?? ""),
    queryFn: () => (id ? getCourseById(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useUserEnrollments() {
  return useQuery({
    queryKey: [...courseKeys.all, "enrollments"],
    queryFn: () => getUserEnrollments(),
    staleTime: 2 * 60 * 1000,
  });
}
