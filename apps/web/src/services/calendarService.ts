import type {
  AcademicYear,
  AcademicYearPayload,
  AssessmentPeriod,
  AssessmentPeriodPayload,
  Holiday,
  HolidayPayload,
} from "@/types/calendar";
import { apiRequest } from "@/lib/api/apiClient";

const unwrap = (res: any) => {
  if (res?.data && res.data.data !== undefined) return res.data.data;
  return res?.data ?? res;
};

// ============================================
// Academic Years (School Admin Calendar)
// ============================================

export async function getAcademicYears(): Promise<AcademicYear[]> {
  const res = await apiRequest("/api/v1/school-admin/calendar/academic-years");
  return unwrap(res) as AcademicYear[];
}

export async function createAcademicYear(payload: AcademicYearPayload): Promise<AcademicYear> {
  const res = await apiRequest("/api/v1/school-admin/calendar/academic-years", {
    method: "POST",
    data: payload,
  });
  return unwrap(res) as AcademicYear;
}

export async function updateAcademicYear(id: string, payload: Partial<AcademicYearPayload>): Promise<AcademicYear> {
  const res = await apiRequest(`/api/v1/school-admin/calendar/academic-years/${id}`, {
    method: "PUT",
    data: payload,
  });
  return unwrap(res) as AcademicYear;
}

export async function deleteAcademicYear(id: string): Promise<void> {
  await apiRequest(`/api/v1/school-admin/calendar/academic-years/${id}`, {
    method: "DELETE",
  });
}

// ============================================
// Assessment Periods (School Admin Calendar)
// ============================================

export async function getAssessmentPeriods(): Promise<AssessmentPeriod[]> {
  const res = await apiRequest("/api/v1/school-admin/calendar/assessment-periods");
  return unwrap(res) as AssessmentPeriod[];
}

export async function createAssessmentPeriod(payload: AssessmentPeriodPayload): Promise<AssessmentPeriod> {
  const res = await apiRequest("/api/v1/school-admin/calendar/assessment-periods", {
    method: "POST",
    data: payload,
  });
  return unwrap(res) as AssessmentPeriod;
}

export async function updateAssessmentPeriod(id: string, payload: Partial<AssessmentPeriodPayload>): Promise<AssessmentPeriod> {
  const res = await apiRequest(`/api/v1/school-admin/calendar/assessment-periods/${id}`, {
    method: "PUT",
    data: payload,
  });
  return unwrap(res) as AssessmentPeriod;
}

export async function deleteAssessmentPeriod(id: string): Promise<void> {
  await apiRequest(`/api/v1/school-admin/calendar/assessment-periods/${id}`, {
    method: "DELETE",
  });
}

// ============================================
// Holidays (School Admin Calendar)
// ============================================

export async function getHolidays(): Promise<Holiday[]> {
  const res = await apiRequest("/api/v1/school-admin/calendar/holidays");
  return unwrap(res) as Holiday[];
}

export async function createHolidays(payload: HolidayPayload): Promise<Holiday[]> {
  const res = await apiRequest("/api/v1/school-admin/calendar/holidays", {
    method: "POST",
    data: payload,
  });
  return unwrap(res) as Holiday[];
}

export async function deleteHoliday(id: string): Promise<void> {
  await apiRequest(`/api/v1/school-admin/calendar/holidays/${id}`, {
    method: "DELETE",
  });
}

// ============================================
// OAuth Calendar Integration (Google / Outlook)
// ============================================

export async function getCalendarAuthUrl(
  provider: "google" | "outlook",
  email?: string,
  redirectUrl?: string,
): Promise<{ url: string }> {
  const query = new URLSearchParams();
  if (email) query.append("email", email);
  if (redirectUrl) query.append("redirectUrl", redirectUrl);

  const qs = query.toString();
  const res = await apiRequest(`/api/v1/coach/auth/${provider}/url${qs ? `?${qs}` : ""}`);
  const nested = res && typeof res === "object" ? res.data || res : res;
  const url = nested?.url || nested?.callbackurl || res?.url || res?.callbackurl;
  if (!url) {
    throw new Error(`API did not return a valid URL. Response: ${JSON.stringify(res)}`);
  }
  return { url };
}

export async function checkCalendarAuthStatus(
  provider: "google" | "outlook",
  email: string,
): Promise<{
  isAuthenticated: boolean;
  email: string;
  userId: string;
  authDetails: {
    connected: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    isTokenValid: boolean;
    isTokenExpired: boolean;
    tokenStatus: string;
    provider: string;
  };
}> {
  const res = await apiRequest(
    `/api/v1/coach/auth/${provider}/status?email=${encodeURIComponent(email)}`
  );
  return res.data || res;
}

export async function disconnectCalendar(
  provider: "google" | "outlook",
  email?: string,
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/v1/coach/auth/${provider}/disconnect`, {
    method: "DELETE",
    ...(email ? { data: { email } } : {}),
  });
}
