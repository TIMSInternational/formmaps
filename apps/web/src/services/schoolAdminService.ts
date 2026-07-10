import {
  SchoolAdminDashboardStats,
  Student,
  StudentInvitePayload,
  BulkStudentInvitePayload,
  StudentsResponse,
  SchoolAnalyticsOverview,
  PerformanceTrendData,
  TopPerformer,
  StudentResultsResponse,
  StudentReport,
  SchoolSettings,
} from "@/types/student";
import { decodeJWTToken, isAdminRole, getCurrentUser } from "./authService";
import { apiRequest } from "@/lib/api/apiClient";
import { toCamel } from "@/lib/toCamel";

// Helper to get current language from i18n
export const getCurrentLanguage = (): "en" | "sp" => {
  if (typeof window !== "undefined") {
    const lang = localStorage.getItem("i18nextLng") || "en";
    return lang.startsWith("es") ? "sp" : "en";
  }
  return "en";
};

// Helper to build query string with language parameter
const buildParams = (params?: Record<string, string | number | undefined>): Record<string, string> => {
  const language = getCurrentLanguage();
  const result: Record<string, string> = { language };
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        result[key] = String(value);
      }
    });
  }
  return result;
};

const buildQueryString = (params?: Record<string, string | number | undefined>): string => {
  const p = buildParams(params);
  const qs = new URLSearchParams(p).toString();
  return qs ? `?${qs}` : "";
};

// ============================================
// Dashboard Stats
// ============================================

export async function getSchoolAdminStats(): Promise<SchoolAdminDashboardStats> {
  try {
    const res = await apiRequest(`/api/v1/school-admin/dashboard/stats${buildQueryString()}`);
    return toCamel(res.data || res);
  } catch (error) {
    throw error;
  }
}

// ============================================
// Student Management
// ============================================

export async function getStudents(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
} = {}): Promise<StudentsResponse> {
  try {
    const res = await apiRequest(`/api/v1/school-admin/students${buildQueryString(params as Record<string, string | number | undefined>)}`);
    return toCamel(res);
  } catch (error) {
    return {
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    };
  }
}

export async function getStudent(studentId: string): Promise<Student> {
  const res = await apiRequest(`/api/v1/school-admin/students/${studentId}${buildQueryString()}`);
  return toCamel(res.data || res);
}

export async function inviteStudent(
  data: StudentInvitePayload
): Promise<{ success: boolean; message: string; student?: any }> {
  const payload = { students: [data] };
  const result = await apiRequest(`/api/v1/school-admin/students/invite${buildQueryString()}`, {
    method: "POST",
    data: payload,
  });
  if (!result.success) {
    throw new Error(result.message || result.error?.message || "Failed to invite student");
  }
  return result;
}

export async function bulkInviteStudents(
  data: BulkStudentInvitePayload
): Promise<{ success: boolean; invited: number; failed: number; results: any[] }> {
  const result = await apiRequest(`/api/v1/school-admin/students/bulk-invite${buildQueryString()}`, {
    method: "POST",
    data,
  });

  if (!result.success && !result.results) {
    throw new Error(result.message || result.error?.message || "Failed to bulk invite students");
  }

  // Map API response to expected return type
  return {
    success: result.success,
    invited: result.invited !== undefined ? result.invited : (result.successCount || 0),
    failed: result.failed !== undefined ? result.failed : (result.failedCount || 0),
    results: result.results || []
  };
}

export async function resendStudentInvite(
  studentId: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/v1/school-admin/students/${studentId}/resend-invite${buildQueryString()}`, {
    method: "POST",
  });
}

export async function removeStudent(
  studentId: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/v1/school-admin/students/${studentId}${buildQueryString()}`, {
    method: "DELETE",
  });
}

// ============================================
// Analytics
// ============================================

export async function getAnalyticsOverview(
  period: "week" | "month" | "quarter" | "year" = "month"
): Promise<SchoolAnalyticsOverview> {
  // Pass the real API fields straight through. The previous version remapped
  // the response into a legacy shape that dropped every field the page reads
  // (studentsAtRisk / counselorCoverage / assessmentCompletionRate /
  // averageProgressScore) → At-Risk 0, Coverage "0% Assign more students",
  // Avg GPA "—" regardless of real data.
  const res = await apiRequest(`/api/v1/school-admin/analytics/overview${buildQueryString({ period })}`);
  const data = toCamel<Partial<SchoolAnalyticsOverview>>(res.data || res);
  return {
    totalStudents: data.totalStudents ?? 0,
    activeStudents: data.activeStudents ?? 0,
    assessmentCompletionRate: data.assessmentCompletionRate ?? 0,
    averageProgressScore: data.averageProgressScore ?? 0,
    studentsAtRisk: data.studentsAtRisk ?? 0,
    counselorCoverage: data.counselorCoverage ?? 0,
  };
}

export async function getPerformanceTrends(
  period: "week" | "month" | "quarter" | "year" = "month",
  metric: "score" | "completion" | "time" = "score"
): Promise<PerformanceTrendData> {
  const defaultData: PerformanceTrendData = {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [{ label: "Average Score", data: [0, 0, 0, 0, 0, 0] }],
  };

  try {
    const res = await apiRequest(`/api/v1/school-admin/analytics/performance-trends${buildQueryString({ period, metric })}`);
    const data = toCamel<Partial<PerformanceTrendData>>(res.data || res);

    return {
      labels: data.labels || defaultData.labels,
      datasets: data.datasets || defaultData.datasets,
    };
  } catch (error) {
    throw error;
  }
}

export async function getTopPerformers(
  limit: number = 10
): Promise<{ data: TopPerformer[] }> {
  try {
    const res = await apiRequest(`/api/v1/school-admin/analytics/top-performers${buildQueryString({ limit })}`);
    return toCamel(res);
  } catch (error) {
    return { data: [] };
  }
}

// ============================================
// Results
// ============================================

export async function getStudentResults(params: {
  page?: number;
  limit?: number;
  studentId?: string;
  assessmentType?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}): Promise<StudentResultsResponse> {
  try {
    const res = await apiRequest(`/api/v1/school-admin/results${buildQueryString(params as Record<string, string | number | undefined>)}`);
    return toCamel(res);
  } catch (error) {
    return {
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    };
  }
}

export async function getStudentReport(
  studentId: string
): Promise<StudentReport | null> {
  try {
    const res = await apiRequest(`/api/v1/school-admin/results/${studentId}${buildQueryString()}`);
    const report = res?.data?.data ?? res?.data ?? null;
    return report && report.student ? (report as StudentReport) : null;
  } catch (error) {
    return null;
  }
}

export async function exportResults(params: {
  format: "csv" | "pdf";
  studentId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<Blob> {
  const qs = buildQueryString({
    format: params.format,
    studentId: params.studentId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  // Export returns a Blob — fall back to raw fetch for binary responses
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/school-admin/results/export${qs}`,
    { credentials: "include" }
  );
  if (!response.ok) throw new Error("Failed to export results");
  return response.blob();
}

// ============================================
// Settings
// ============================================

export async function getSchoolSettings(): Promise<SchoolSettings | null> {
  try {
    const res = await apiRequest(`/api/v1/school-admin/settings${buildQueryString()}`);
    const camel = toCamel<{ data?: SchoolSettings }>(res);
    return camel?.data ?? (camel as unknown as SchoolSettings);
  } catch (error) {
    return null;
  }
}

export async function updateAdminProfile(data: {
  name?: string;
  phone?: string;
}): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/v1/user/profile", {
    method: "PUT",
    data: { fullName: data.name, phone: data.phone },
  });
}

export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string }> {
  // The backend identifies the user from the auth token; oldPassword is verified server-side.
  return apiRequest("/authapi/change-password", {
    method: "PUT",
    data: { password: data.newPassword, oldPassword: data.currentPassword },
  });
}

// ============================================
// School Admin Access Verification
// ============================================

export async function verifySchoolAdminAccess(): Promise<{
  isSchoolAdmin: boolean;
  schoolId?: string;
  schoolName?: string;
}> {
  try {
    // Check profile via API (cookies sent automatically)
    const user = await getCurrentUser();
    const userRole = user.role?.name || "";
    if (isAdminRole(userRole)) {
      return {
        isSchoolAdmin: true,
        schoolId: user.schoolId || "school-1",
        schoolName: "Admin School",
      };
    }

    return { isSchoolAdmin: false };
  } catch (error) {
    return { isSchoolAdmin: false };
  }
}
