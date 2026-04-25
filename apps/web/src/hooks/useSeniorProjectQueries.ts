"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMySeniorProject,
  createSeniorProject,
  updateSeniorProject,
  uploadSeniorProjectAttachment,
  getStudentSeniorProject,
  reviewStudentSeniorProject,
} from "@/services/seniorProjectService";
import type {
  SeniorProjectPayload,
  SeniorProjectReviewPayload,
} from "@/types/seniorProject";
import { toast } from "sonner";

export const seniorProjectKeys = {
  all: ["seniorProject"] as const,
  mine: () => [...seniorProjectKeys.all, "mine"] as const,
  student: (studentId: string) =>
    [...seniorProjectKeys.all, "student", studentId] as const,
};

// ─── Student hooks ─────────────────────────────────────────────────

export function useMySeniorProject() {
  return useQuery({
    queryKey: seniorProjectKeys.mine(),
    queryFn: getMySeniorProject,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateSeniorProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SeniorProjectPayload) =>
      createSeniorProject(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: seniorProjectKeys.all });
      toast.success("Senior project created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateSeniorProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      payload: Partial<SeniorProjectPayload & { status: "submitted" }>
    ) => updateSeniorProject(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: seniorProjectKeys.all });
      toast.success("Senior project updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUploadSeniorProjectAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadSeniorProjectAttachment(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: seniorProjectKeys.all });
      toast.success("Attachment uploaded");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Admin/Counselor hooks ──────────────────────────────────────────

export function useStudentSeniorProject(studentId: string) {
  return useQuery({
    queryKey: seniorProjectKeys.student(studentId),
    queryFn: () => getStudentSeniorProject(studentId),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useReviewSeniorProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      studentId,
      payload,
    }: {
      studentId: string;
      payload: SeniorProjectReviewPayload;
    }) => reviewStudentSeniorProject(studentId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: seniorProjectKeys.all });
      toast.success("Review submitted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
