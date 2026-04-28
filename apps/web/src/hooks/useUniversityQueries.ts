"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  University,
  UniversityFilters,
  UniversityListResponse,
  UniversityRecommendationsResponse,
  UniversityRecommendationStats,
  UniversityFavorite,
  UniversityComparison,
  UniversityFilterOptions,
} from "@/types/university";
import {
  fetchUniversities,
  fetchUniversityById,
  fetchUniversityRecommendations,
  fetchUniversityRecommendationStats,
  fetchUniversityFavorites,
  compareUniversities,
  fetchUniversityFilterOptions,
  toggleUniversityFavorite,
} from "@/services/universityService";


export const universityKeys = {
  all: ["universities"] as const,
  list: (filters: UniversityFilters, page: number, limit: number) =>
    [...universityKeys.all, "list", filters, page, limit] as const,
  detail: (id: string) => [...universityKeys.all, "detail", id] as const,
  recommendations: (userId: string) =>
    [...universityKeys.all, "reco", userId] as const,
  stats: (userId: string) => [...universityKeys.all, "stats", userId] as const,
  favorites: (userId: string) =>
    [...universityKeys.all, "favorites", userId] as const,
  filters: () => [...universityKeys.all, "filters"] as const,
  compare: (ids: string[]) =>
    [...universityKeys.all, "compare", ...ids] as const,
};

export function useUniversityList(
  filters: UniversityFilters,
  page = 1,
  limit = 20
) {
  return useQuery<UniversityListResponse, Error>({
    queryKey: universityKeys.list(filters, page, limit),
    queryFn: () => fetchUniversities(filters, page, limit),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useUniversity(id: string | null) {
  return useQuery<University | null, Error>({
    queryKey: universityKeys.detail(id || ""),
    queryFn: () => (id ? fetchUniversityById(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useUniversityRecommendations(userId: string | null) {
  return useQuery<UniversityRecommendationsResponse, Error>({
    queryKey: universityKeys.recommendations(userId || ""),
    queryFn: () =>
      userId
        ? fetchUniversityRecommendations(userId)
        : Promise.reject(new Error("No user")),
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function useUniversityStats(userId: string | null) {
  return useQuery<UniversityRecommendationStats, Error>({
    queryKey: universityKeys.stats(userId || ""),
    queryFn: () =>
      userId
        ? fetchUniversityRecommendationStats(userId)
        : Promise.reject(new Error("No user")),
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function useUniversityFavorites(userId: string | null) {
  return useQuery<UniversityFavorite[], Error>({
    queryKey: universityKeys.favorites(userId || ""),
    queryFn: () =>
      userId ? fetchUniversityFavorites(userId) : Promise.resolve([]),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUniversityFiltersOptions() {
  return useQuery<UniversityFilterOptions, Error>({
    queryKey: universityKeys.filters(),
    queryFn: () => fetchUniversityFilterOptions(),
    staleTime: 60 * 60 * 1000,
  });
}

export function useUniversityCompare(ids: string[]) {
  return useQuery<UniversityComparison, Error>({
    queryKey: universityKeys.compare(ids),
    queryFn: () => compareUniversities(ids),
    enabled: ids.length > 1,
  });
}

export function useUniversityFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      universityId,
      action,
    }: {
      universityId: string;
      action: "save" | "unsave";
    }) => toggleUniversityFavorite(universityId, action),
    onSuccess: (_, { universityId }) => {
      // Invalidate all favorites queries
      queryClient.invalidateQueries({
        queryKey: universityKeys.all,
      });
    },
  });
}

