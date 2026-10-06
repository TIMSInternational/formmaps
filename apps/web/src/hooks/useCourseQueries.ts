"use client";

import { useQuery } from "@tanstack/react-query";
import { useContentLanguage } from "@/lib/i18n/contentLanguage";
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
  // The UI language: the course endpoints return that language + English (#397).
  const lang = useContentLanguage();
  return useQuery({
    queryKey: [...courseKeys.list(), lang],
    queryFn: () => listCourses(lang),
    staleTime: 2 * 60 * 1000,
  });
}

export function useRecommendedCourses() {
  // The UI language: the course endpoints return that language + English (#397).
  const lang = useContentLanguage();
  return useQuery({
    queryKey: [...courseKeys.recommended(), lang],
    queryFn: () => getRecommendedCourses(lang),
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
