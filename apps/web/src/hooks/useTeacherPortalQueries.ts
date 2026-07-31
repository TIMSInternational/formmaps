"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getTeacherProfile,
  getTeacherPendingEvaluations,
  verifyTeacherInviteToken,
  completeTeacherOnboarding,
  type TeacherOnboardingPayload,
} from "@/services/teacherPortalService";

export const teacherKeys = {
  all: ["teacher"] as const,
  profile: () => [...teacherKeys.all, "profile"] as const,
  pendingEvaluations: () => [...teacherKeys.all, "pending-evaluations"] as const,
};

export function useTeacherProfile() {
  return useQuery({
    queryKey: teacherKeys.profile(),
    queryFn: getTeacherProfile,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeacherPendingEvaluations() {
  return useQuery({
    queryKey: teacherKeys.pendingEvaluations(),
    queryFn: getTeacherPendingEvaluations,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Teacher Onboarding (public) ─────────────────────────────────────────────

export const teacherOnboardingKeys = {
  verify: (token: string) => ["teacher-onboarding", "verify", token] as const,
};

export function useVerifyTeacherToken(token: string) {
  return useQuery({
    queryKey: teacherOnboardingKeys.verify(token),
    queryFn: () => verifyTeacherInviteToken(token),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });
}

export function useCompleteTeacherOnboarding() {
  return useMutation({
    mutationFn: (payload: TeacherOnboardingPayload) =>
      completeTeacherOnboarding(payload),
  });
}
