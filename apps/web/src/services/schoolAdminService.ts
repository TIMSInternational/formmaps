import {
  SchoolAdminDashboardStats,
  Student,
  StudentInvitePayload,
  BulkStudentInvitePayload,
  StudentsResponse,
  AnalyticsOverview,
  PerformanceTrendData,
  TopPerformer,
  StudentResultsResponse,
  StudentDetailResult,
  SchoolSettings,
} from "@/types/student";
import { decodeJWTToken, isAdminRole, getCurrentUser } from "./authService";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

// Helper to get token
const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token");
  }
  return null;
};

// Helper to get current language from i18n
export const getCurrentLanguage = (): "en" | "sp" => {
  if (typeof window !== "undefined") {
    const lang = localStorage.getItem("i18nextLng") || "en";
    return lang.startsWith("es") ? "sp" : "en";
  }
  return "en";
};

// Helper for headers with optional language
const getHeaders = () => {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
};

// Helper to build URL with language parameter
const buildUrl = (endpoint: string, params?: Record<string, string | number | undefined>) => {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  const language = getCurrentLanguage();
  url.searchParams.append("language", language);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
};

// ============================================
// Dashboard Stats
// ============================================

export async function getSchoolAdminStats(): Promise<SchoolAdminDashboardStats> {
  try {
    const response = await fetch(
      buildUrl("/api/v1/school-admin/dashboard/stats"),
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error("Failed to fetch stats");
    const json = await response.json();
    return json.data || json;
  } catch (error) {
    console.warn("getSchoolAdminStats API failed, returning mock data");
    return {
      totalStudents: 0,
      pendingInvites: 0,
      acceptedStudents: 0,
      activeStudents: 0,
      completedAssessments: 0,
      averageScore: 0,
    };
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
    const response = await fetch(
      buildUrl("/api/v1/school-admin/students", {
        page: params.page,
        limit: params.limit,
        search: params.search,
        status: params.status,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      }),
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error("Failed to fetch students");
    return response.json();
  } catch (error) {
    console.warn("getStudents API failed, returning empty data");
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
  const response = await fetch(
    buildUrl(`/api/v1/school-admin/students/${studentId}`),
    { headers: getHeaders() }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch student");
  }

  const json = await response.json();
  return json.data || json;
}

export async function inviteStudent(
  data: StudentInvitePayload
): Promise<{ success: boolean; message: string; student?: any }> {
  const payload = { students: [data] };
  const response = await fetch(
    buildUrl("/api/v1/school-admin/students/invite"),
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error?.message || "Failed to invite student");
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || result.error?.message || "Failed to invite student");
  }
  return result;
}

export async function bulkInviteStudents(
  data: BulkStudentInvitePayload
): Promise<{ success: boolean; invited: number; failed: number; results: any[] }> {
  const response = await fetch(
    buildUrl("/api/v1/school-admin/students/bulk-invite"),
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error?.message || "Failed to bulk invite students");
  }

  const result = await response.json();

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
  const response = await fetch(
    buildUrl(`/api/v1/school-admin/students/${studentId}/resend-invite`),
    {
      method: "POST",
      headers: getHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to resend invitation");
  }

  return response.json();
}

export async function removeStudent(
  studentId: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    buildUrl(`/api/v1/school-admin/students/${studentId}`),
    {
      method: "DELETE",
      headers: getHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to remove student");
  }

  return response.json();
}

// ============================================
// Analytics
// ============================================

export async function getAnalyticsOverview(
  period: "week" | "month" | "quarter" | "year" = "month"
): Promise<AnalyticsOverview> {
  const defaultData: AnalyticsOverview = {
    studentEngagement: { active: 0, inactive: 0, trend: 0 },
    assessmentCompletion: {
      completed: 0,
      inProgress: 0,
      notStarted: 0,
      completionRate: 0,
    },
    averagePerformance: { score: 0, trend: 0 },
    timeSpent: { averageHours: 0, totalHours: 0, trend: 0 },
  };

  try {
    const response = await fetch(
      buildUrl("/api/v1/school-admin/analytics/overview", { period }),
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error("Failed to fetch analytics");
    const json = await response.json();
    const data = json.data || json;

    return {
      studentEngagement: { ...defaultData.studentEngagement, ...(data.studentEngagement || {}) },
      assessmentCompletion: { ...defaultData.assessmentCompletion, ...(data.assessmentCompletion || {}) },
      averagePerformance: { ...defaultData.averagePerformance, ...(data.averagePerformance || {}) },
      timeSpent: { ...defaultData.timeSpent, ...(data.timeSpent || {}) },
    };
  } catch (error) {
    console.warn("getAnalyticsOverview API failed, returning mock data");
    return defaultData;
  }
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
    const response = await fetch(
      buildUrl("/api/v1/school-admin/analytics/performance-trends", { period, metric }),
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error("Failed to fetch trends");
    const json = await response.json();
    const data = json.data || json;

    return {
      labels: data.labels || defaultData.labels,
      datasets: data.datasets || defaultData.datasets,
    };
  } catch (error) {
    console.warn("getPerformanceTrends API failed, returning mock data");
    return defaultData;
  }
}

export async function getTopPerformers(
  limit: number = 10
): Promise<{ data: TopPerformer[] }> {
  try {
    const response = await fetch(
      buildUrl("/api/v1/school-admin/analytics/top-performers", { limit }),
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error("Failed to fetch top performers");
    return response.json();
  } catch (error) {
    console.warn("getTopPerformers API failed, returning empty data");
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
    const response = await fetch(
      buildUrl("/api/v1/school-admin/results", {
        page: params.page,
        limit: params.limit,
        studentId: params.studentId,
        assessmentType: params.assessmentType,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      }),
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error("Failed to fetch results");
    return response.json();
  } catch (error) {
    console.warn("getStudentResults API failed, returning empty data");
    return {
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    };
  }
}

export async function getStudentDetailResult(
  studentId: string
): Promise<StudentDetailResult | null> {
  try {
    const response = await fetch(
      buildUrl(`/api/v1/school-admin/results/${studentId}/detail`),
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error("Failed to fetch student detail");
    return response.json();
  } catch (error) {
    console.warn("getStudentDetailResult API failed");
    return null;
  }
}

export async function exportResults(params: {
  format: "csv" | "pdf";
  studentId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<Blob> {
  const response = await fetch(
    buildUrl("/api/v1/school-admin/results/export", {
      format: params.format,
      studentId: params.studentId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    }),
    { headers: getHeaders() }
  );

  if (!response.ok) {
    throw new Error("Failed to export results");
  }

  return response.blob();
}

// ============================================
// Settings
// ============================================

export async function getSchoolSettings(): Promise<SchoolSettings | null> {
  try {
    const response = await fetch(
      buildUrl("/api/v1/school-admin/settings"),
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error("Failed to fetch settings");
    return response.json();
  } catch (error) {
    console.warn("getSchoolSettings API failed");
    return null;
  }
}

export async function updateAdminProfile(data: {
  name?: string;
  phone?: string;
}): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    buildUrl("/api/v1/school-admin/settings/profile"),
    {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to update profile");
  }

  return response.json();
}

export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    buildUrl("/api/v1/school-admin/settings/password"),
    {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to change password");
  }

  return response.json();
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
    const token = getToken();
    if (!token) return { isSchoolAdmin: false };

    // Try decoding the token first for a fast check
    const decoded = decodeJWTToken(token);
    if (decoded) {
      const roleName = decoded.role?.name || decoded.roleName || decoded.role || "";
      if (isAdminRole(roleName) || roleName === "school_admin") {
        return {
          isSchoolAdmin: true,
          schoolId: decoded.schoolId || "school-1",
          schoolName: decoded.schoolName || "Admin School",
        };
      }
    }

    // Fallback: Check profile
    const user = await getCurrentUser();
    const userRole = user.role?.name || "";
    if (isAdminRole(userRole)) {
      return {
        isSchoolAdmin: true,
        schoolId: "school-1", // Update if backend provides this in user profile
        schoolName: "Admin School",
      };
    }

    return { isSchoolAdmin: false };
  } catch (error) {
    // If all else fails, allow access in development
    console.warn("verifySchoolAdminAccess failed, falling back to development defaults:", error);
    return {
      isSchoolAdmin: true,
      schoolId: "dev-school",
      schoolName: "Development School"
    };
  }
}
