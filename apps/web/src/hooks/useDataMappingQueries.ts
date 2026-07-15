"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDataMappings,
  createDataMapping,
  updateDataMapping,
  deleteDataMapping,
  getAIMappingSuggestions,
  bulkApproveMappings,
} from "@/services/dataMappingService";
import type { DataMappingPayload, AIMappingSuggestPayload } from "@/types/dataMapping";

// ============================================
// Query Keys
// ============================================

export const dataMappingKeys = {
  all: ["data-mappings"] as const,
  list: (params?: object) => [...dataMappingKeys.all, "list", params] as const,
};

// ============================================
// Data Mapping Hooks (SCRUM-142)
// ============================================

export function useDataMappings(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: dataMappingKeys.list(params),
    queryFn: () => getDataMappings(params),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateDataMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DataMappingPayload) => createDataMapping(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataMappingKeys.all });
    },
  });
}

export function useUpdateDataMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<DataMappingPayload> }) =>
      updateDataMapping(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataMappingKeys.all });
    },
  });
}

export function useDeleteDataMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDataMapping(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataMappingKeys.all });
    },
  });
}

export function useAIMappingSuggestions() {
  return useMutation({
    mutationFn: (payload: AIMappingSuggestPayload) => getAIMappingSuggestions(payload),
  });
}

export function useBulkApproveMappings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkApproveMappings(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataMappingKeys.all });
    },
  });
}
