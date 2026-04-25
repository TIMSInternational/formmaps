"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMyCoursePlan,
  getStudentCoursePlan,
  getMyCourseRecommendations,
  addCourseToPlan,
  removeCourseFromPlan,
  counselorAddCourseToPlan,
  counselorRemoveCourseFromPlan,
  submitChangeRequest,
  getMyChangeRequests,
  cancelChangeRequest,
  getStudentChangeRequests,
  reviewChangeRequest,
  schoolAdminAddCourseToPlan,
  schoolAdminRemoveCourseFromPlan,
  getSchoolAdminStudentChangeRequests,
  reviewSchoolAdminStudentChangeRequest,
} from "@/services/coursePlanService";
import type {
  CourseChangeRequestPayload,
  ChangeRequestReviewPayload,
} from "@/types/coursePlan";
import { toast } from "sonner";

export const coursePlanKeys = {
  all: ["course-plan"] as const,
  myPlan: () => [...coursePlanKeys.all, "my-plan"] as const,
  studentPlan: (studentId: string) =>
    [...coursePlanKeys.all, "student", studentId] as const,
  recommendations: () => [...coursePlanKeys.all, "recommendations"] as const,
  myRequests: (status?: string) =>
    [...coursePlanKeys.all, "my-requests", status ?? "all"] as const,
  studentRequests: (studentId: string, status?: string) =>
    [...coursePlanKeys.all, "student-requests", studentId, status ?? "all"] as const,
  adminStudentRequests: (studentId: string, status?: string) =>
    [...coursePlanKeys.all, "admin-student-requests", studentId, status ?? "all"] as const,
};

// Student-facing: get my course plan
export function useMyCoursePlan() {
  return useQuery({
    queryKey: coursePlanKeys.myPlan(),
    queryFn: getMyCoursePlan,
    staleTime: 5 * 60 * 1000,
  });
}

// Counselor-facing: get a specific student's course plan
export function useStudentCoursePlan(studentId?: string) {
  return useQuery({
    queryKey: coursePlanKeys.studentPlan(studentId ?? ""),
    queryFn: () => getStudentCoursePlan(studentId!),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });
}

// Student-facing: get AI course recommendations
export function useMyCourseRecommendations() {
  return useQuery({
    queryKey: coursePlanKeys.recommendations(),
    queryFn: getMyCourseRecommendations,
    staleTime: 10 * 60 * 1000,
  });
}

// Add course to plan (student - direct)
export function useAddCourseToPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { courseId: string; gradeLevel: number; semester: string }) =>
      addCourseToPlan(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.all });
      toast.success("Course added to plan");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// Remove course from plan (student - direct)
export function useRemoveCourseFromPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) => removeCourseFromPlan(enrollmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.all });
      toast.success("Course removed from plan");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Counselor direct edit hooks ─────────────────────────────────────────────

export function useCounselorAddCourse(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { courseId: string; gradeLevel: number; semester: string }) =>
      counselorAddCourseToPlan(studentId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success("Course added to student's plan");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCounselorRemoveCourse(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) =>
      counselorRemoveCourseFromPlan(studentId, enrollmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success("Course removed from student's plan");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Student change request hooks ────────────────────────────────────────────

export function useMyChangeRequests(status?: string) {
  return useQuery({
    queryKey: coursePlanKeys.myRequests(status),
    queryFn: () => getMyChangeRequests({ status, limit: 50 }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSubmitChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CourseChangeRequestPayload) => submitChangeRequest(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.myRequests() });
      toast.success("Change request submitted — awaiting counselor approval");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCancelChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelChangeRequest(requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.myRequests() });
      toast.success("Change request cancelled");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Counselor change request review hooks ───────────────────────────────────

export function useStudentChangeRequests(studentId: string, status?: string) {
  return useQuery({
    queryKey: coursePlanKeys.studentRequests(studentId, status),
    queryFn: () => getStudentChangeRequests(studentId, { status, limit: 50 }),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useReviewChangeRequest(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: string;
      payload: ChangeRequestReviewPayload;
    }) => reviewChangeRequest(studentId, requestId, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentRequests(studentId) });
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentRequests(studentId, "pending") });
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      // Also refresh the counselor dashboard change-requests panel
      qc.invalidateQueries({ queryKey: ["counselor", "dashboard-change-requests"] });
      toast.success(
        vars.payload.status === "approved" ? "Request approved" : "Request rejected"
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── School Admin hooks ──────────────────────────────────────────────────────

export function useSchoolAdminAddCourse(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { courseId: string; courseCode: string; courseName: string; credits: number; gradeLevel: number; semester: string }) =>
      schoolAdminAddCourseToPlan(studentId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success("Course added to plan");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSchoolAdminRemoveCourse(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) => schoolAdminRemoveCourseFromPlan(studentId, enrollmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success("Course removed from plan");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSchoolAdminStudentChangeRequests(studentId: string, status?: string) {
  return useQuery({
    queryKey: coursePlanKeys.adminStudentRequests(studentId, status),
    queryFn: () => getSchoolAdminStudentChangeRequests(studentId, { status }),
    enabled: !!studentId,
  });
}

export function useSchoolAdminReviewChangeRequest(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, payload }: { requestId: string; payload: ChangeRequestReviewPayload }) =>
      reviewSchoolAdminStudentChangeRequest(studentId, requestId, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: coursePlanKeys.adminStudentRequests(studentId) });
      qc.invalidateQueries({ queryKey: coursePlanKeys.studentPlan(studentId) });
      toast.success(
        vars.payload.status === "approved" ? "Request approved" : "Request rejected"
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
