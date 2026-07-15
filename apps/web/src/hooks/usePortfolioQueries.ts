"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPortfolioItems,
  getPortfolioSummary,
  createPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem,
} from "@/services/portfolioService";
import type { PortfolioItemPayload, PortfolioItemType } from "@/types/portfolio";
import { toast } from "sonner";

export const portfolioKeys = {
  all: ["portfolio"] as const,
  list: (params?: { type?: PortfolioItemType; page?: number }) =>
    [...portfolioKeys.all, "list", params ?? {}] as const,
  summary: () => [...portfolioKeys.all, "summary"] as const,
};

export function usePortfolioItems(params?: {
  type?: PortfolioItemType;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: portfolioKeys.list(params),
    queryFn: () => getPortfolioItems(params ?? {}),
    staleTime: 2 * 60 * 1000,
  });
}

export function usePortfolioSummary() {
  return useQuery({
    queryKey: portfolioKeys.summary(),
    queryFn: getPortfolioSummary,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePortfolioItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PortfolioItemPayload) => createPortfolioItem(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portfolioKeys.all });
      toast.success("Portfolio item created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePortfolioItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<PortfolioItemPayload> }) =>
      updatePortfolioItem(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portfolioKeys.all });
      toast.success("Portfolio item updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeletePortfolioItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePortfolioItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portfolioKeys.all });
      toast.success("Portfolio item deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
