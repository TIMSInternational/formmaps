"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getParentProfile,
  getChildProgress,
  getParentPendingEvaluations,
  getStudentParents,
  inviteParentToStudent,
  revokeParentAccess,
  resendParentInvite,
  getParentNotifications,
  markParentNotificationRead,
  markAllParentNotificationsRead,
  verifyParentInviteToken,
  completeParentOnboarding,
  getMyParents,
  inviteMyParent,
  revokeMyParentAccess,
  resendMyParentInvite,
  type ParentOnboardingPayload,
} from "@/services/parentPortalService";
import type { ParentInviteRequest } from "@/types/parentPortal";
import { toast } from "sonner";

export const parentKeys = {
  all: ["parent"] as const,
  profile: () => [...parentKeys.all, "profile"] as const,
  childProgress: (studentId: string) =>
    [...parentKeys.all, "child-progress", studentId] as const,
  pendingEvaluations: () =>
    [...parentKeys.all, "pending-evaluations"] as const,
  studentParents: (studentId: string) =>
    [...parentKeys.all, "student-parents", studentId] as const,
  myParents: () => [...parentKeys.all, "my-parents"] as const,
  notifications: () => [...parentKeys.all, "notifications"] as const,
};

export function useParentProfile() {
  return useQuery({
    queryKey: parentKeys.profile(),
    queryFn: getParentProfile,
    staleTime: 5 * 60 * 1000,
  });
}

export function useChildProgress(studentId?: string) {
  return useQuery({
    queryKey: parentKeys.childProgress(studentId ?? ""),
    queryFn: () => getChildProgress(studentId!),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useParentPendingEvaluations() {
  return useQuery({
    queryKey: parentKeys.pendingEvaluations(),
    queryFn: getParentPendingEvaluations,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Student Parents (used by school-admin / counselor) ──────────────────────

export function useStudentParents(studentId?: string) {
  return useQuery({
    queryKey: parentKeys.studentParents(studentId ?? ""),
    queryFn: () => getStudentParents(studentId!),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useInviteParent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ParentInviteRequest) => inviteParentToStudent(payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: parentKeys.studentParents(vars.studentId) });
      toast.success("Invite sent successfully");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to send invite"),
  });
}

export function useRevokeParentAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, parentLinkId }: { studentId: string; parentLinkId: string }) =>
      revokeParentAccess(studentId, parentLinkId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: parentKeys.studentParents(vars.studentId) });
      toast.success("Access revoked");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to revoke access"),
  });
}

export function useResendParentInvite() {
  return useMutation({
    mutationFn: ({ studentId, parentLinkId }: { studentId: string; parentLinkId: string }) =>
      resendParentInvite(studentId, parentLinkId),
    onSuccess: () => toast.success("Invite resent"),
    onError: (err: Error) => toast.error(err.message || "Failed to resend invite"),
  });
}

// ─── Student Self-Invitation (called by student) ─────────────────────────────

export function useMyParents() {
  return useQuery({
    queryKey: parentKeys.myParents(),
    queryFn: getMyParents,
    staleTime: 2 * 60 * 1000,
  });
}

export function useInviteMyParent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<ParentInviteRequest, "studentId">) => inviteMyParent(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: parentKeys.myParents() });
      toast.success("Invite sent successfully");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to send invite"),
  });
}

export function useRevokeMyParentAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (parentLinkId: string) => revokeMyParentAccess(parentLinkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: parentKeys.myParents() });
      toast.success("Access revoked");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to revoke access"),
  });
}

export function useResendMyParentInvite() {
  return useMutation({
    mutationFn: (parentLinkId: string) => resendMyParentInvite(parentLinkId),
    onSuccess: () => toast.success("Invite resent"),
    onError: (err: Error) => toast.error(err.message || "Failed to resend invite"),
  });
}

// ─── Parent Notifications ─────────────────────────────────────────────────────

export function useParentNotifications() {
  return useQuery({
    queryKey: parentKeys.notifications(),
    queryFn: getParentNotifications,
    staleTime: 60 * 1000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markParentNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: parentKeys.notifications() }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllParentNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: parentKeys.notifications() });
      toast.success("All notifications marked as read");
    },
  });
}

// ─── Parent Onboarding (public) ──────────────────────────────────────────────

export const parentOnboardingKeys = {
  verify: (token: string) => ["parent-onboarding", "verify", token] as const,
};

export function useVerifyParentToken(token: string) {
  return useQuery({
    queryKey: parentOnboardingKeys.verify(token),
    queryFn: () => verifyParentInviteToken(token),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });
}

export function useCompleteParentOnboarding() {
  return useMutation({
    mutationFn: (payload: ParentOnboardingPayload) =>
      completeParentOnboarding(payload),
  });
}
