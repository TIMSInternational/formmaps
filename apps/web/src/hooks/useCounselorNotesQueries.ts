"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getStudentNotes,
  createNote,
  updateNote,
  deleteNote,
  completeFollowUp,
} from "@/services/counselorNotesService";
import type { CounselorNotePayload } from "@/types/counselorNotes";
import { toast } from "sonner";

export const counselorNotesKeys = {
  all: ["counselor-notes"] as const,
  studentNotes: (studentId: string, params?: Record<string, unknown>) =>
    [...counselorNotesKeys.all, "student", studentId, params ?? {}] as const,
};

export function useStudentNotes(
  studentId?: string,
  params?: { page?: number; limit?: number; type?: string }
) {
  return useQuery({
    queryKey: counselorNotesKeys.studentNotes(studentId ?? "", params),
    queryFn: () => getStudentNotes(studentId!, params),
    enabled: !!studentId,
    staleTime: 1 * 60 * 1000,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CounselorNotePayload) => createNote(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: counselorNotesKeys.studentNotes(variables.studentId),
      });
      toast.success("Note added");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      noteId,
      payload,
    }: {
      noteId: string;
      studentId: string;
      payload: Partial<CounselorNotePayload>;
    }) => updateNote(noteId, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: counselorNotesKeys.studentNotes(variables.studentId),
      });
      toast.success("Note updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId }: { noteId: string; studentId: string }) =>
      deleteNote(noteId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: counselorNotesKeys.studentNotes(variables.studentId),
      });
      toast.success("Note deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCompleteFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId }: { noteId: string; studentId: string }) =>
      completeFollowUp(noteId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: counselorNotesKeys.studentNotes(variables.studentId),
      });
      toast.success("Follow-up completed");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
