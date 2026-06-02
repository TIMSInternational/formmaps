import type {
  SchoolProfile,
  SchoolProfilePayload,
  SchoolUser,
  SchoolUsersResponse,
  StaffInvitePayload,
  BulkStaffInvitePayload,
  StudentAssignPayload,
  CounselorStudent,
  CounselorStudentsResponse,
} from "@/types/assessmentConfig";
import { apiRequest } from "@/lib/api/apiClient";
import { toCamel } from "@/lib/toCamel";

const buildQueryString = (params?: Record<string, string | number | undefined>): string => {
  if (!params) return "";
  const filtered: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      filtered[key] = String(value);
    }
  });
  const qs = new URLSearchParams(filtered).toString();
  return qs ? `?${qs}` : "";
};

// ============================================
// School Profile (SCRUM-130)
// ============================================

export async function getSchoolProfile(): Promise<SchoolProfile> {
  const res = await apiRequest("/api/v1/school-admin/school/profile");
  const data = res.data ?? res.Data ?? res;
  return toCamel(data) as SchoolProfile;
}

export async function updateSchoolProfile(payload: SchoolProfilePayload): Promise<SchoolProfile> {
  const res = await apiRequest("/api/v1/school-admin/school/profile", {
    method: "PUT",
    data: payload,
  });
  const data = res.data ?? res.Data ?? res;
  return toCamel(data) as SchoolProfile;
}

export async function uploadSchoolLogo(file: File): Promise<{ logoUrl: string }> {
  // Step 1: Upload file to S3 via upload endpoint
  const form = new FormData();
  form.append("file", file);
  const uploadRes = await apiRequest("/api/v1/upload/school-logo", {
    method: "POST",
    data: form,
    headers: { "Content-Type": "multipart/form-data" },
  });
  const uploadData = uploadRes.data ?? uploadRes.Data ?? uploadRes;
  const logoUrl = uploadData.logoUrl || uploadData.url || "";
  if (!logoUrl) throw new Error("Upload failed — no URL returned");

  // Step 2: Update school profile with the new logo URL
  await apiRequest("/api/v1/school-admin/school/profile", {
    method: "PUT",
    data: { logoUrl },
  });

  return { logoUrl };
}

// ============================================
// User / Role Management (SCRUM-134)
// ============================================

export async function getSchoolUsers(params?: {
  role?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<SchoolUsersResponse> {
  const res = await apiRequest(`/api/v1/school-admin/users${buildQueryString(params as Record<string, string | number | undefined>)}`);
  const data = res.data ?? res.Data ?? res;
  return toCamel(data) as SchoolUsersResponse;
}

export async function inviteStaff(payload: StaffInvitePayload): Promise<SchoolUser> {
  const res = await apiRequest("/api/v1/school-admin/staff/invite", {
    method: "POST",
    data: payload,
  });
  const data = res.data ?? res.Data ?? res;
  return toCamel(data) as SchoolUser;
}

export async function bulkInviteStaff(payload: BulkStaffInvitePayload): Promise<{
  success: boolean;
  invited: number;
  failed: number;
  results: { email: string; status: string }[];
}> {
  const res = await apiRequest("/api/v1/school-admin/staff/bulk-invite", {
    method: "POST",
    data: payload,
  });
  const data = res.data ?? res.Data ?? res;
  return toCamel(data);
}

export async function updateUserRole(userId: string, role: string): Promise<void> {
  await apiRequest(`/api/v1/school-admin/users/${userId}/role`, {
    method: "PUT",
    data: { role },
  });
}

export async function assignStudents(counselorId: string, payload: StudentAssignPayload): Promise<void> {
  await apiRequest(`/api/v1/school-admin/counselors/${counselorId}/assign-students`, {
    method: "POST",
    data: payload,
  });
}

export async function unassignStudents(counselorId: string, payload: StudentAssignPayload): Promise<void> {
  await apiRequest(`/api/v1/school-admin/counselors/${counselorId}/assign-students`, {
    method: "DELETE",
    data: payload,
  });
}

export async function getAllCounselorAssignments(): Promise<Array<{ studentId: string; counselorId: string }>> {
  const res = await apiRequest("/api/v1/school-admin/counselor-assignments/all");
  return res.data ?? [];
}

export async function getCounselorStudents(counselorId: string, params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<CounselorStudentsResponse> {
  const res = await apiRequest(
    `/api/v1/school-admin/counselors/${counselorId}/students${buildQueryString(params as Record<string, string | number | undefined>)}`
  );
  const data = res.data ?? res.Data ?? res;
  return toCamel(data) as CounselorStudentsResponse;
}

// ============================================
// Counselor Self-Serve (SCRUM-145)
// ============================================

export async function getMyCounselorStudents(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
}): Promise<CounselorStudentsResponse> {
  // Backend path: /api/v1/counselor/me/students (confirmed from Postman)
  const res = await apiRequest(
    `/api/v1/counselor/me/students${buildQueryString(params as Record<string, string | number | undefined>)}`
  );
  const data = res.data ?? res.Data ?? res;
  return toCamel(data) as CounselorStudentsResponse;
}

export async function getMyCounselorStudentDetail(
  studentId: string
): Promise<CounselorStudent> {
  // Backend path: /api/v1/counselor/me/students/:id (confirmed from Postman)
  const res = await apiRequest(`/api/v1/counselor/me/students/${studentId}`);
  const data = res.data ?? res.Data ?? res;
  return toCamel(data) as CounselorStudent;
}
