"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMyCommunityService,
  logCommunityService,
  getStudentCommunityService,
  verifyCommunityServiceEntry,
} from "@/services/communityServiceService";
import type {
  CommunityServicePayload,
  CommunityServiceVerifyPayload,
} from "@/types/communityService";
import { toast } from "sonner";

export const communityServiceKeys = {
  all: ["communityService"] as const,
  mine: () => [...communityServiceKeys.all, "mine"] as const,
  student: (studentId: string) =>
    [...communityServiceKeys.all, "student", studentId] as const,
};

// ─── Student hooks ─────────────────────────────────────────────────

export function useMyCommunityService() {
  return useQuery({
    queryKey: communityServiceKeys.mine(),
    queryFn: getMyCommunityService,
    staleTime: 2 * 60 * 1000,
  });
}

export function useLogCommunityService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CommunityServicePayload) =>
      logCommunityService(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: communityServiceKeys.all });
      toast.success("Community service hours logged");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Admin/Counselor hooks ──────────────────────────────────────────

export function useStudentCommunityService(studentId: string) {
  return useQuery({
    queryKey: communityServiceKeys.student(studentId),
    queryFn: () => getStudentCommunityService(studentId),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useVerifyCommunityServiceEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entryId,
      payload,
    }: {
      entryId: string;
      payload: CommunityServiceVerifyPayload;
    }) => verifyCommunityServiceEntry(entryId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: communityServiceKeys.all });
      toast.success("Entry updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
