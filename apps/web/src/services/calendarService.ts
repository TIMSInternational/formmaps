import type {
  AcademicYear,
  AcademicYearPayload,
  AssessmentPeriod,
  AssessmentPeriodPayload,
  Holiday,
  HolidayPayload,
} from "@/types/calendar";
import { apiRequest } from "@/lib/api/apiClient";
import { unwrapList } from "@/lib/unwrapList";

const unwrap = (res: Record<string, unknown>) => {
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
// OAuth Calendar Integration (Google / Outlook) — user-level, any role.
// Identity comes from the JWT; no email params. Backend: /api/v1/calendar/*
// ============================================

export type CalendarProviderName = "google" | "outlook";

export interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}

/** configured:false means OAuth creds aren't set on this server — hide the buttons. */
export async function getCalendarAuthUrl(
  provider: CalendarProviderName,
): Promise<{ configured: boolean; url?: string }> {
  const returnTo = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/dashboard";
  const res = await apiRequest(`/api/v1/calendar/${provider}/url?redirectUrl=${encodeURIComponent(returnTo)}`);
  return res?.data ?? { configured: false };
}

export async function getCalendarStatus(provider: CalendarProviderName): Promise<CalendarStatus> {
  try {
    const res = await apiRequest(`/api/v1/calendar/${provider}/status`);
    return res?.data ?? { configured: false, connected: false, email: null, connectedAt: null };
  } catch {
    return { configured: false, connected: false, email: null, connectedAt: null };
  }
}

export async function disconnectCalendar(provider: CalendarProviderName): Promise<void> {
  await apiRequest(`/api/v1/calendar/${provider}/disconnect`, { method: "DELETE" });
}
