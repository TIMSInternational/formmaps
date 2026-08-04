"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getStudentNotes,
  createNote,
  updateNote,
  deleteNote,
  completeFollowUp,
} from "@/services/counselorNotesService";
import type {
  CounselorNote,
  CounselorNotePayload,
  CounselorNotesResponse,
} from "@/types/counselorNotes";
import { toast } from "sonner";
import {
  keyParams,
  optimisticId,
  patchBy,
  patchEnvelope,
  removeBy,
  upsertBy,
  useOptimisticCache,
} from "./useOptimisticCache";

// ── formmaps#89: optimistic notes ───────────────────────────────────────────────
// Writing a note used to cost two sequential round trips before anything appeared on
// screen: the POST, then an invalidate-driven refetch of the whole page of notes. The
// note now appears the moment it is sent, and the POST response REPLACES it rather
// than triggering a refetch — so the second round trip is gone, not merely hidden
// behind a spinner.
//
// The general rules live in useOptimisticCache.ts. The one specific to this file is
// the insert target: notes come back ordered `createdDate desc` and optionally
// filtered by type, so a new note belongs at the top of page 1 of the unfiltered list
// and of a list filtered to its own type — and nowhere else.

export const counselorNotesKeys = {
  all: ["counselor-notes"] as const,
  studentNotes: (studentId: string, params?: Record<string, unknown>) =>
    [...counselorNotesKeys.all, "student", studentId, params ?? {}] as const,
  /** Every cached page and type-filter of one student's notes — the unit a write touches. */
  student: (studentId: string) =>
    [...counselorNotesKeys.all, "student", studentId] as const,
};

type NotesParams = { page?: number; limit?: number; type?: string };

export function useStudentNotes(studentId?: string, params?: NotesParams) {
  return useQuery({
    queryKey: counselorNotesKeys.studentNotes(studentId ?? "", params),
    queryFn: () => getStudentNotes(studentId!, params),
    enabled: !!studentId,
    staleTime: 1 * 60 * 1000,
  });
}

const studentNotesFilter = (studentId: string) => ({
  queryKey: counselorNotesKeys.student(studentId),
});

export function useCreateNote() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: (payload: CounselorNotePayload) => createNote(payload),

    onMutate: async (payload) => {
      const pendingId = optimisticId();
      const now = new Date().toISOString();
      const pending: CounselorNote = {
        id: pendingId,
        studentId: payload.studentId,
        // Left empty rather than guessed: the row renders without it, and the POST
        // response carries the real value a beat later.
        authorId: "",
        type: payload.type,
        content: payload.content,
        isPrivate: payload.isPrivate,
        followUpDate: payload.followUpDate ?? null,
        followUpCompleted: false,
        tags: payload.tags ?? [],
        createdDate: now,
        updatedAt: now,
      };

      const context = await optimistic.patch<CounselorNotesResponse>(
        studentNotesFilter(payload.studentId),
        (current, key) => {
          const params = keyParams<NotesParams>(key);
          // A new note is the newest, so it only ever lands on page 1 …
          if ((params.page ?? 1) !== 1) return undefined;
          // … and never in a list filtered to some other note type.
          if (params.type && params.type !== payload.type) return undefined;
          return patchEnvelope(current, (rows) => [pending, ...rows]);
        },
      );
      return { ...context, pendingId };
    },

    onSuccess: (note, payload, context) => {
      // The server row replaces the placeholder in place. No invalidate: this response
      // IS what the refetch would have returned, so refetching would buy the same rows
      // a second time. `total` was already incremented by the optimistic insert.
      optimistic.replace<CounselorNotesResponse>(
        studentNotesFilter(payload.studentId),
        (current) => ({
          ...current,
          // Matched on the placeholder id — matching on the server id would find
          // nothing and `upsertBy` would append a duplicate.
          data: upsertBy(current.data, (n) => n.id === context?.pendingId, note),
        }),
      );
      toast.success("Note added");
    },

    onError: (err: Error, _payload, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}

export function useUpdateNote() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({
      noteId,
      payload,
    }: {
      noteId: string;
      studentId: string;
      payload: Partial<CounselorNotePayload>;
    }) => updateNote(noteId, payload),

    onMutate: ({ noteId, studentId, payload }) =>
      optimistic.patch<CounselorNotesResponse>(studentNotesFilter(studentId), (current) =>
        patchEnvelope(current, (rows) =>
          patchBy(rows, (n) => n.id === noteId, (n) => ({ ...n, ...payload })),
        ),
      ),

    onSuccess: (note, { studentId, noteId }) => {
      optimistic.replace<CounselorNotesResponse>(studentNotesFilter(studentId), (current) => ({
        ...current,
        // Merged, not substituted: the write endpoint echoes the bare row without the
        // `authorName` join the list endpoint adds, and substituting would drop it.
        data: patchBy(current.data, (n) => n.id === noteId, (n) => ({ ...n, ...note })),
      }));
      toast.success("Note updated");
    },

    onError: (err: Error, _vars, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}

export function useDeleteNote() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({ noteId }: { noteId: string; studentId: string }) => deleteNote(noteId),

    // Server-side this is a soft delete (`isActive: false`), so the row is gone from
    // every subsequent read. Removing it from all cached pages is therefore correct;
    // on pages that never held it the filter is a no-op and `total` does not move.
    onMutate: ({ noteId, studentId }) =>
      optimistic.patch<CounselorNotesResponse>(studentNotesFilter(studentId), (current) =>
        patchEnvelope(current, (rows) => removeBy(rows, (n) => n.id === noteId)),
      ),

    onSuccess: () => toast.success("Note deleted"),

    // The rollback that matters most in this file. A note that vanishes and stays
    // vanished after a failed delete reads as data loss — and this endpoint really
    // does reject: it 403s on another counselor's note, while the UI shows a delete
    // button on every note in the list, including ones this user did not write.
    onError: (err: Error, _vars, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}

export function useCompleteFollowUp() {
  const optimistic = useOptimisticCache();

  return useMutation({
    mutationFn: ({ noteId }: { noteId: string; studentId: string }) => completeFollowUp(noteId),

    onMutate: ({ noteId, studentId }) =>
      optimistic.patch<CounselorNotesResponse>(studentNotesFilter(studentId), (current) =>
        patchEnvelope(current, (rows) =>
          patchBy(rows, (n) => n.id === noteId, (n) => ({ ...n, followUpCompleted: true })),
        ),
      ),

    onSuccess: (result, { studentId, noteId }) => {
      // This endpoint answers with a partial row — { id, followUpCompleted,
      // followUpCompletedAt } — so merge rather than substitute.
      optimistic.replace<CounselorNotesResponse>(studentNotesFilter(studentId), (current) => ({
        ...current,
        data: patchBy(current.data, (n) => n.id === noteId, (n) => ({ ...n, ...result })),
      }));
      toast.success("Follow-up completed");
    },

    onError: (err: Error, _vars, context) => {
      optimistic.rollback(context);
      toast.error(err.message);
    },
  });
}
