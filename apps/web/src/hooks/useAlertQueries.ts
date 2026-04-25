"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAlerts,
  getAlertSummary,
  updateAlert,
  bulkAlertAction,
} from "@/services/alertService";
import type { AlertUpdatePayload, AlertBulkActionPayload, AlertsQueryParams } from "@/types/alert";

// ============================================
// Query Keys
// ============================================

export const alertKeys = {
  all: ["alerts"] as const,
  list: (params?: AlertsQueryParams) => [...alertKeys.all, "list", params] as const,
  summary: () => [...alertKeys.all, "summary"] as const,
};

// ============================================
// Alert Hooks (SCRUM-146/151)
// ============================================

export function useAlerts(params?: AlertsQueryParams) {
  return useQuery({
    queryKey: alertKeys.list(params),
    queryFn: () => getAlerts(params),
    staleTime: 1000 * 60 * 2,
  });
}

export function useAlertSummary() {
  return useQuery({
    queryKey: alertKeys.summary(),
    queryFn: getAlertSummary,
    staleTime: 1000 * 60 * 2,
  });
}

export function useUpdateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, payload }: { alertId: string; payload: AlertUpdatePayload }) =>
      updateAlert(alertId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    },
  });
}

export function useBulkAlertAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AlertBulkActionPayload) => bulkAlertAction(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    },
  });
}
