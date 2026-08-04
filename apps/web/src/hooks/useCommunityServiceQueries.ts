"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMyCommunityService,
  logCommunityService,
  getStudentCommunityService,
  verifyCommunityServiceEntry,
  updateCommunityService,
  deleteCommunityService,
  normalizeEntry,
} from "@/services/communityServiceService";
import type {
  CommunityServiceEntry,
  CommunityServicePayload,
  CommunityServiceSummary,
  CommunityServiceUpdatePayload,
  CommunityServiceVerifyPayload,
} from "@/types/communityService";
import { toast } from "sonner";
import { optimisticId, patchBy, removeBy, upsertBy, useOptimisticCache } from "./useOptimisticCache";

// ── formmaps#89: optimistic community-service hours ─────────────────────────────
//
// Logging hours used to take two sequential round trips before the row and the
// progress bar moved. Both now move at once.
//
// The interesting part of this file is the TOTALS. Unlike the gradebook's GPA — which
// is computed server-side from a school's own configuration and so must never be
// guessed — these three numbers are already derived on the client (see `toSummary`),
// and the API returns every entry with no pagination, so `sum(entries) === totalHours`
// always holds. They can be kept exact rather than left stale.
//
// They are adjusted by a DELTA rather than recomputed from the patched list, because a
// delta is right whatever base the server sent, while a recompute silently substitutes
// the client's arithmetic for the server's and would paper over a real disagreement.

export const communityServiceKeys = {
  all: ["communityService"] as const,
  mine: () => [...communityServiceKeys.all, "mine"] as const,
  student: (studentId: string) =>
    [...communityServiceKeys.all, "student", studentId] as const,
  /** Every cached student's entries — the unit an admin verification can touch. */
  students: () => [...communityServiceKeys.all, "student"] as const,
};

/**
 * How one entry's hours are counted, by status. Mirrors `toSummary`:
 * `logged` counts every entry including rejected ones; `pending` and `verified` count
 * only their own status.
 */
const buckets = (entry: Pick<CommunityServiceEntry, "status" | "hours">) => ({
  logged: entry.hours,
  pending: entry.status === "pending" ? entry.hours : 0,
  verified: entry.status === "verified" ? entry.hours : 0,
});

/** Add an entry's contribution to the summary totals (negative `sign` removes it). */
function applyTotals(
  summary: CommunityServiceSummary,
  entry: Pick<CommunityServiceEntry, "status" | "hours">,
  sign: 1 | -1,
): CommunityServiceSummary {
  const b = buckets(entry);
  return {
    ...summary,
    totalHoursLogged: Math.max(0, summary.totalHoursLogged + sign * b.logged),
    totalHoursPending: Math.max(0, summary.totalHoursPending + sign * b.pending),
    totalHoursVerified: Math.max(0, summary.totalHoursVerified + sign * b.verified),
  };
}

/** Entries are returned newest-first by `date`; keep an inserted row in that order. */
const byDateDesc = (a: CommunityServiceEntry, b: CommunityServiceEntry) =>
  new Date(b.date).getTime() - new Date(a.date).getTime();

// ─── Student hooks ─────────────────────────────────────────────────

export function useMyCommunityService() {
  return useQuery({
    queryKey: communityServiceKeys.mine(),
    queryFn: getMyCommunityService,
    staleTime: 2 * 60 * 1000,
  });
}

const mineFilter = { queryKey: communityServiceKeys.mine() };

export function useLogCommunityService() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (payload: CommunityServicePayload) => logCommunityService(payload),

    onMutate: async (payload) => {
      const pendingId = optimisticId();
      const pending: CommunityServiceEntry = {
        id: pendingId,
        organization: payload.organization,
        description: payload.description,
        hours: payload.hours,
        date: payload.date,
        supervisorName: payload.supervisorName,
        supervisorEmail: payload.supervisorEmail,
        // Not a guess: the column defaults to `pending` and nothing on the create path
        // can set it otherwise.
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const context = await optimistic.patch<CommunityServiceSummary>(mineFilter, (current) =>
        applyTotals(
          { ...current, entries: [...current.entries, pending].sort(byDateDesc) },
          pending,
          1,
        ),
      );
      return { ...context, pendingId };
    },

    onSuccess: (entry, _payload, context) => {
      // The POST returns the created row, so it replaces the placeholder and no refetch
      // is needed. `normalizeEntry` is not optional here: the raw row carries `hours` as
      // a Decimal STRING, and letting that into the cache would turn the next total
      // adjustment into string concatenation.
      const real = normalizeEntry(entry);
      optimistic.replace<CommunityServiceSummary>(mineFilter, (current) => ({
        ...current,
        entries: upsertBy(current.entries, (e) => e.id === context?.pendingId, real)
          .sort(byDateDesc),
      }));
      toast.success("Community service hours logged");
    },

    onError: (err: Error, _payload, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}

export function useUpdateCommunityService() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({ entryId, payload }: { entryId: string; payload: CommunityServiceUpdatePayload }) =>
      updateCommunityService(entryId, payload),

    onMutate: ({ entryId, payload }) =>
      optimistic.patch<CommunityServiceSummary>(mineFilter, (current) => {
        const before = current.entries.find((e) => e.id === entryId);
        if (!before) return undefined;
        const after = { ...before, ...payload, hours: payload.hours ?? before.hours };
        // Both endpoints refuse to edit anything but a pending entry, and the UI only
        // offers Edit on pending rows, so the status cannot change here — but running
        // the delta through remove-then-add keeps that from being an assumption.
        const withoutOld = applyTotals(current, before, -1);
        return applyTotals(
          {
            ...withoutOld,
            entries: patchBy(current.entries, (e) => e.id === entryId, () => after).sort(byDateDesc),
          },
          after,
          1,
        );
      }),

    onSuccess: (entry, { entryId }) => {
      const real = normalizeEntry(entry);
      optimistic.replace<CommunityServiceSummary>(mineFilter, (current) => ({
        ...current,
        entries: patchBy(current.entries, (e) => e.id === entryId, () => real).sort(byDateDesc),
      }));
      toast.success("Entry updated");
    },

    onError: (err: Error, _vars, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}

export function useDeleteCommunityService() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (entryId: string) => deleteCommunityService(entryId),

    onMutate: (entryId) =>
      optimistic.patch<CommunityServiceSummary>(mineFilter, (current) => {
        const gone = current.entries.find((e) => e.id === entryId);
        if (!gone) return undefined;
        return applyTotals(
          { ...current, entries: removeBy(current.entries, (e) => e.id === entryId) },
          gone,
          -1,
        );
      }),

    onSuccess: () => toast.success("Entry deleted"),

    // The server refuses to delete anything already verified or rejected (404). The UI
    // hides Delete on those rows, so this only fires on a genuine race — an admin
    // verifying the entry while the student is deleting it — but that is exactly the
    // case where the row must come back rather than silently disappear.
    onError: (err: Error, _entryId, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
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
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({
      entryId,
      payload,
    }: {
      entryId: string;
      payload: CommunityServiceVerifyPayload;
    }) => verifyCommunityServiceEntry(entryId, payload),

    // Patches every cached STUDENT, because the admin hook is keyed per student and an
    // entry id alone does not say which one it belongs to; the find() is a no-op for
    // every student that does not hold it. Scoped to `students()` rather than `all` so
    // it cannot collide with the `mine()` entry, which onSuccess invalidates instead.
    onMutate: ({ entryId, payload }) =>
      optimistic.patch<CommunityServiceSummary>(
        { queryKey: communityServiceKeys.students() },
        (current) => {
          const before = current.entries.find((e) => e.id === entryId);
          if (!before) return undefined;
          const after = { ...before, status: payload.status, note: payload.note };
          const withoutOld = applyTotals(current, before, -1);
          return applyTotals(
            {
              ...withoutOld,
              entries: patchBy(current.entries, (e) => e.id === entryId, () => after),
            },
            after,
            1,
          );
        },
      ),

    onSuccess: (entry, { entryId }) => {
      const real = normalizeEntry(entry);
      optimistic.replace<CommunityServiceSummary>(
        { queryKey: communityServiceKeys.students() },
        (current) => ({
          ...current,
          entries: patchBy(current.entries, (e) => e.id === entryId, () => real),
        }),
      );
      // The student's own view of these hours lives under a different key, and its
      // totals come from a different endpoint — cheaper to let it refetch than to
      // reproduce that endpoint's arithmetic here.
      qc.invalidateQueries({ queryKey: communityServiceKeys.mine() });
      toast.success("Entry updated");
    },

    onError: (err: Error, _vars, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}
