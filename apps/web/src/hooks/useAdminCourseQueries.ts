"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { adminListCourses } from "@/services/courseService";

export const adminCourseKeys = {
  all: ["adminCourses"] as const,
  list: (params?: Record<string, any>) =>
    [
      ...adminCourseKeys.all,
      "list",
      params ? JSON.stringify(params) : "default",
    ] as const,
  detail: (id: string) => [...adminCourseKeys.all, "detail", id] as const,
};

export function useAdminCourseList(params?: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  return useQuery({
    queryKey: adminCourseKeys.list(params),
    queryFn: () => adminListCourses(params),
    placeholderData: keepPreviousData,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAdminCourseDetail(id?: string) {
  return useQuery({
    queryKey: adminCourseKeys.detail(id ?? ""),
    queryFn: () => Promise.resolve(null),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}
