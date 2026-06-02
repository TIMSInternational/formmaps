"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listCareers,
  getCareerById,
  recommendCareers,
} from "@/services/careerService";
import { useGlobalStore } from "@/store/useGlobalStore";

export const careerKeys = {
  all: ["careers"] as const,
  list: (params?: Record<string, unknown>) =>
    [
      ...careerKeys.all,
      "list",
      params ? JSON.stringify(params) : "default",
    ] as const,
  detail: (id: string) => [...careerKeys.all, "detail", id] as const,
  recommendations: (userId: string) =>
    [...careerKeys.all, "recommendations", userId] as const,
};

export function useCareerList(params?: {
  search?: string;
  industry?: string;
  interest?: string;
  education?: string;
  location?: string;
  sort?: "recommended" | "match" | "title" | "demand";
}) {
  const { language } = useGlobalStore();
  return useQuery({
    queryKey: careerKeys.list(params),
    queryFn: () => listCareers(params),
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}

export function useCareerDetails(id?: string) {
  const { language } = useGlobalStore();
  return useQuery({
    queryKey: careerKeys.detail(id ?? ""),
    queryFn: () => (id ? getCareerById(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useRecommendations(userId?: string) {
  return useQuery({
    queryKey: careerKeys.recommendations(userId ?? ""),
    queryFn: () =>
      userId
        ? recommendCareers({ userId })
        : Promise.resolve({ recommendations: [] }),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePrefetchCareers() {
  const queryClient = useQueryClient();
  return {
    prefetchList: (params?: Record<string, unknown>) =>
      queryClient.prefetchQuery({
        queryKey: careerKeys.list(params),
        queryFn: () => listCareers(params),
      }),
    prefetchCareer: (id: string) =>
      queryClient.prefetchQuery({
        queryKey: careerKeys.detail(id),
        queryFn: () => getCareerById(id),
      }),
  };
}
