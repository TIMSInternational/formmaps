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
import type {
  ParentInviteRequest,
  ParentNotification,
  ParentRelationship,
  StudentParentLink,
} from "@/types/parentPortal";
import { toast } from "sonner";
import {
  optimisticId,
  patchBy,
  removeBy,
  useOptimisticCache,
} from "./useOptimisticCache";

// ── formmaps#89: optimistic parent-portal writes ────────────────────────────────
// Every write in this file used to cost TWO sequential round trips before anything
// moved on screen: the mutation, then an invalidate-driven refetch of the list. The
// list now changes the moment the request is sent.
//
// The general rules live in useOptimisticCache.ts. The judgement calls specific to
// this file:
//
//   invite   -> optimistic INSERT, and it still invalidates. The row is entirely
//               client-known (name, email, relationship, always `pending`), but the
//               link id is minted server-side and the invite response does NOT carry
//               the list row back — the school-admin route answers `{ inviteId }` and
//               the student route answers `{ id, invitationUrl }` — so the placeholder
//               has to be reconciled by a refetch rather than replaced in place.
//   revoke   -> optimistic REMOVE, no invalidate. The row being gone is the entire
//               server-side effect; refetching would buy the same list again.
//   resend   -> NO optimistic step. Nothing the user can see changes client-side: the
//               server re-mints the invite token and pushes `tokenExpiresAt` out, and
//               `status` is derived from that expiry — so an "expired" row goes back to
//               "pending" in a way the client cannot compute. It invalidates instead.
//   mark read-> optimistic flag flip, no invalidate. `isRead: true` is the whole change
//               and the client knows it exactly; the endpoints answer 204. The unread
//               count in the header is derived from this same list, so it follows.
//
// Rollback restores a SNAPSHOT rather than refetching: a refetch on error is slower
// and, if the error was the network itself, may never resolve at all.

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

const studentParentsFilter = (studentId: string) => ({
  queryKey: parentKeys.studentParents(studentId),
});
const myParentsFilter = () => ({ queryKey: parentKeys.myParents() });
const notificationsFilter = () => ({ queryKey: parentKeys.notifications() });

/**
 * The row an invite adds to the list, before the server has minted its id.
 *
 * `status` is always "pending" — an invite cannot be born accepted — and `invitedAt`
 * is now, which is what the server stamps a moment later. Nothing here is guessed at:
 * the only server-assigned field is the id, and that is a placeholder the refetch
 * replaces. `isOptimisticId` identifies it in the meantime, for any caller that wants
 * to disable the row's resend/revoke buttons while it is in flight.
 */
function pendingLink(input: {
  name: string;
  email: string;
  relationship: ParentRelationship;
}): StudentParentLink {
  return {
    id: optimisticId(),
    name: input.name,
    email: input.email,
    relationship: input.relationship,
    status: "pending",
    invitedAt: new Date().toISOString(),
  };
}

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
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (payload: ParentInviteRequest) => inviteParentToStudent(payload),

    // Prepended, not appended: the list comes back ordered `createdDate DESC`, so the
    // invite just sent is the first row — appending would show it at the bottom and
    // then have it jump to the top when the refetch lands.
    onMutate: (payload) => {
      const pending = pendingLink(payload);
      return optimistic.patch<StudentParentLink[]>(
        studentParentsFilter(payload.studentId),
        (current) => [pending, ...current],
      );
    },

    onSuccess: () => toast.success("Invite sent successfully"),

    onError: (err: Error, _payload, context) => {
      optimistic.rollback(context);
      toast.error(err.message || "Failed to send invite");
    },

    // Reconciles the placeholder id with the real one. Left as the only refetch in
    // this hook because the invite response is not the list row.
    onSettled: (_result, _err, payload) => {
      qc.invalidateQueries({ queryKey: parentKeys.studentParents(payload.studentId) });
    },
  });
}

export function useRevokeParentAccess() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({ studentId, parentLinkId }: { studentId: string; parentLinkId: string }) =>
      revokeParentAccess(studentId, parentLinkId),

    onMutate: ({ studentId, parentLinkId }) =>
      optimistic.patch<StudentParentLink[]>(studentParentsFilter(studentId), (current) =>
        removeBy(current, (p) => p.id === parentLinkId),
      ),

    // No invalidate: the row being gone is the whole of what the DELETE does, and the
    // "N linked · M pending" counts the panel shows are derived from this same list.
    onSuccess: () => toast.success("Access revoked"),

    // The rollback that matters most here. A guardian who vanishes from the list and
    // stays vanished after a rejected revoke reads as data loss, and this endpoint
    // does reject — the panel shows a revoke button on every row, including links the
    // current admin did not create.
    onError: (err: Error, _vars, context) => {
      optimistic.rollback(context);
      toast.error(err.message || "Failed to revoke access");
    },
  });
}

export function useResendParentInvite() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ studentId, parentLinkId }: { studentId: string; parentLinkId: string }) =>
      resendParentInvite(studentId, parentLinkId),

    // Deliberately NOT optimistic — see the header. The visible effect of a resend is
    // a new `tokenExpiresAt`, and the `status` badge is derived from it, so faking the
    // result would mean guessing the server's expiry window.
    onSuccess: (_result, { studentId }) => {
      qc.invalidateQueries({ queryKey: parentKeys.studentParents(studentId) });
      toast.success("Invite resent");
    },

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
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (payload: Omit<ParentInviteRequest, "studentId">) => inviteMyParent(payload),

    onMutate: (payload) => {
      const pending = pendingLink(payload);
      return optimistic.patch<StudentParentLink[]>(myParentsFilter(), (current) => [
        pending,
        ...current,
      ]);
    },

    onSuccess: () => toast.success("Invite sent successfully"),

    onError: (err: Error, _payload, context) => {
      optimistic.rollback(context);
      toast.error(err.message || "Failed to send invite");
    },

    // As with the school-admin invite: the response carries an id and an invitation
    // URL, not the list row, so the placeholder is reconciled by the refetch.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: parentKeys.myParents() });
    },
  });
}

export function useRevokeMyParentAccess() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (parentLinkId: string) => revokeMyParentAccess(parentLinkId),

    onMutate: (parentLinkId) =>
      optimistic.patch<StudentParentLink[]>(myParentsFilter(), (current) =>
        removeBy(current, (p) => p.id === parentLinkId),
      ),

    onSuccess: () => toast.success("Access revoked"),

    onError: (err: Error, _parentLinkId, context) => {
      optimistic.rollback(context);
      toast.error(err.message || "Failed to revoke access");
    },
  });
}

export function useResendMyParentInvite() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (parentLinkId: string) => resendMyParentInvite(parentLinkId),

    // Not optimistic, for the same reason as the school-admin resend.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: parentKeys.myParents() });
      toast.success("Invite resent");
    },

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
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (id: string) => markParentNotificationRead(id),

    onMutate: (id) =>
      optimistic.patch<ParentNotification[]>(notificationsFilter(), (current) =>
        patchBy(current, (n) => n.id === id, (n) => ({ ...n, isRead: true })),
      ),

    // No invalidate. This is the clearest instance of #89 in the file: the endpoint
    // answers with no body, `isRead: true` is the entire change and the client already
    // knows it, and the old invalidate refetched the whole notification list on every
    // single "mark read" click.

    // A row that un-highlights and then silently re-highlights needs an explanation,
    // hence the toast — the page shows no other error surface for this action.
    onError: (err: Error, _id, context) => {
      optimistic.rollback(context);
      toast.error(err.message || "Failed to mark notification as read");
    },
  });
}

export function useMarkAllNotificationsRead() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: markAllParentNotificationsRead,

    // Matched on `!n.isRead` rather than blanket-mapping, so rows that were already
    // read keep their identity and React re-renders only what changed.
    onMutate: () =>
      optimistic.patch<ParentNotification[]>(notificationsFilter(), (current) =>
        patchBy(current, (n) => !n.isRead, (n) => ({ ...n, isRead: true })),
      ),

    onSuccess: () => toast.success("All notifications marked as read"),

    onError: (err: Error, _vars, context) => {
      optimistic.rollback(context);
      toast.error(err.message || "Failed to mark notifications as read");
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

/**
 * Deliberately NOT optimistic (#89). This one call creates the parent's account and
 * answers with a server-issued auth token, refresh token, user id and redirect URL —
 * none of which can be predicted, and none of which is in a cache to patch. The caller
 * is a public onboarding page that navigates away on success; there is no list to keep
 * warm and nothing to roll back.
 */
export function useCompleteParentOnboarding() {
  return useMutation({
    mutationFn: (payload: ParentOnboardingPayload) =>
      completeParentOnboarding(payload),
  });
}
