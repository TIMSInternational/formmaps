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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

const getHeaders = () => {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
};

const buildUrl = (endpoint: string, params?: Record<string, string | number | undefined>) => {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    });
  }
  return url.toString();
};

const handleResponse = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.error?.message || err.message || "Request failed");
  }
  const json = await res.json();
  return json.data ?? json;
};

// ============================================
// School Profile (SCRUM-130)
// ============================================

export async function getSchoolProfile(): Promise<SchoolProfile> {
  const res = await fetch(buildUrl("/api/v1/school-admin/school/profile"), {
    headers: getHeaders(),
  });
  return handleResponse<SchoolProfile>(res);
}

export async function updateSchoolProfile(payload: SchoolProfilePayload): Promise<SchoolProfile> {
  const res = await fetch(buildUrl("/api/v1/school-admin/school/profile"), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<SchoolProfile>(res);
}

export async function uploadSchoolLogo(file: File): Promise<{ logoUrl: string }> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(buildUrl("/api/v1/school-admin/school/logo"), {
    method: "POST",
    headers,
    body: form,
  });
  return handleResponse<{ logoUrl: string }>(res);
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
  const res = await fetch(
    buildUrl("/api/v1/school-admin/users", params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<SchoolUsersResponse>(res);
}

export async function inviteStaff(payload: StaffInvitePayload): Promise<SchoolUser> {
  const res = await fetch(buildUrl("/api/v1/school-admin/staff/invite"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<SchoolUser>(res);
}

export async function bulkInviteStaff(payload: BulkStaffInvitePayload): Promise<{
  success: boolean;
  invited: number;
  failed: number;
  results: { email: string; status: string }[];
}> {
  const res = await fetch(buildUrl("/api/v1/school-admin/staff/bulk-invite"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function updateUserRole(userId: string, role: string): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/users/${userId}/role`), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error("Failed to update role");
}

export async function assignStudents(counselorId: string, payload: StudentAssignPayload): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/counselors/${counselorId}/assign-students`), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to assign students");
}

export async function unassignStudents(counselorId: string, payload: StudentAssignPayload): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/counselors/${counselorId}/assign-students`), {
    method: "DELETE",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to unassign students");
}

export async function getCounselorStudents(counselorId: string, params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<CounselorStudentsResponse> {
  const res = await fetch(
    buildUrl(`/api/v1/school-admin/counselors/${counselorId}/students`, params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<CounselorStudentsResponse>(res);
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
  const res = await fetch(
    buildUrl("/api/v1/counselor/me/students", params as Record<string, string | number>),
    { headers: getHeaders() }
  );
  return handleResponse<CounselorStudentsResponse>(res);
}

export async function getMyCounselorStudentDetail(
  studentId: string
): Promise<CounselorStudent> {
  // Backend path: /api/v1/counselor/me/students/:id (confirmed from Postman)
  const res = await fetch(
    `${API_BASE_URL}/api/v1/counselor/me/students/${studentId}`,
    { headers: getHeaders() }
  );
  return handleResponse<CounselorStudent>(res);
}

