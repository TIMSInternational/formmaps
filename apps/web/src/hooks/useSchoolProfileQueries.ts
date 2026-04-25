"use client";

import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSchoolProfile,
  updateSchoolProfile,
  uploadSchoolLogo,
  getSchoolUsers,
  inviteStaff,
  bulkInviteStaff,
  updateUserRole,
  assignStudents,
  unassignStudents,
  getCounselorStudents,
  getMyCounselorStudents,
  getMyCounselorStudentDetail,
} from "@/services/schoolProfileService";
import type {
  SchoolProfilePayload,
  StaffInvitePayload,
  BulkStaffInvitePayload,
  StudentAssignPayload,
} from "@/types/assessmentConfig";

// ============================================
// Query Keys
// ============================================

export const schoolProfileKeys = {
  all: ["school-profile"] as const,
  profile: () => [...schoolProfileKeys.all, "profile"] as const,
  users: () => [...schoolProfileKeys.all, "users"] as const,
  userList: (params?: object) => [...schoolProfileKeys.users(), "list", params] as const,
  counselorStudents: (counselorId: string, params?: object) =>
    [...schoolProfileKeys.all, "counselor-students", counselorId, params] as const,
  myCounselorStudents: (params?: object) =>
    [...schoolProfileKeys.all, "my-students", params] as const,
};

// ============================================
// School Profile Hooks (SCRUM-130)
// ============================================

export function useSchoolProfile() {
  return useQuery({
    queryKey: schoolProfileKeys.profile(),
    queryFn: getSchoolProfile,
    staleTime: 1000 * 60 * 30,
  });
}

export function useUpdateSchoolProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SchoolProfilePayload) => updateSchoolProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolProfileKeys.profile() });
    },
  });
}

export function useUploadSchoolLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadSchoolLogo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolProfileKeys.profile() });
    },
  });
}

// ============================================
// User Management Hooks (SCRUM-134)
// ============================================

export function useSchoolUsers(params?: {
  role?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: schoolProfileKeys.userList(params),
    queryFn: () => getSchoolUsers(params),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });
}

export function useInviteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StaffInvitePayload) => inviteStaff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolProfileKeys.users() });
    },
  });
}

export function useBulkInviteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkStaffInvitePayload) => bulkInviteStaff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolProfileKeys.users() });
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateUserRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolProfileKeys.users() });
    },
  });
}

export function useAssignStudents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      counselorId,
      payload,
    }: {
      counselorId: string;
      payload: StudentAssignPayload;
    }) => assignStudents(counselorId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolProfileKeys.all });
    },
  });
}

export function useUnassignStudents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      counselorId,
      payload,
    }: {
      counselorId: string;
      payload: StudentAssignPayload;
    }) => unassignStudents(counselorId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolProfileKeys.all });
    },
  });
}

// ============================================
// Counselor Student Hooks (SCRUM-145)
// ============================================

export function useCounselorStudents(
  counselorId: string,
  params?: { page?: number; limit?: number; search?: string }
) {
  return useQuery({
    queryKey: schoolProfileKeys.counselorStudents(counselorId, params),
    queryFn: () => getCounselorStudents(counselorId, params),
    enabled: !!counselorId,
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });
}

export function useMyCounselorStudents(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  return useQuery({
    queryKey: schoolProfileKeys.myCounselorStudents(params),
    queryFn: () => getMyCounselorStudents(params),
    staleTime: 1000 * 60 * 2,
    placeholderData: keepPreviousData,
  });
}

export function useMyCounselorStudentDetail(studentId?: string) {
  return useQuery({
    queryKey: [...schoolProfileKeys.myCounselorStudents(), "detail", studentId],
    queryFn: () => getMyCounselorStudentDetail(studentId!),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 2,
  });
}
