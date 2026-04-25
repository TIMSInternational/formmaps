"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCounselorDashboard, getCounselorDashboardChangeRequests } from "@/services/counselorService";
import { reviewChangeRequest } from "@/services/coursePlanService";
import type { ChangeRequestReviewPayload } from "@/types/coursePlan";
import { toast } from "sonner";

export const counselorKeys = {
  all: ["counselor"] as const,
  dashboard: () => [...counselorKeys.all, "dashboard"] as const,
  dashboardChangeRequests: () => [...counselorKeys.all, "dashboard-change-requests"] as const,
};

export function useCounselorDashboard() {
  return useQuery({
    queryKey: counselorKeys.dashboard(),
    queryFn: () => getCounselorDashboard(),
    staleTime: 1000 * 60 * 2,
  });
}

export function useCounselorPendingChangeRequests() {
  return useQuery({
    queryKey: counselorKeys.dashboardChangeRequests(),
    queryFn: () => getCounselorDashboardChangeRequests(),
    staleTime: 1000 * 60 * 1,
  });
}

export function useReviewDashboardChangeRequest(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, payload }: { requestId: string; payload: ChangeRequestReviewPayload }) =>
      reviewChangeRequest(studentId, requestId, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: counselorKeys.dashboardChangeRequests() });
      toast.success(vars.payload.status === "approved" ? "Request approved ✓" : "Request rejected");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}