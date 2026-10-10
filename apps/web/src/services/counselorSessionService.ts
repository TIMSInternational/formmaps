import { apiRequest } from "@/lib/api/apiClient";
import { fetchAllPages } from "@/lib/api/fetchAllPages";

/** Both backends serve counselor sessions at most 50 per page. */
export const SESSIONS_PAGE_MAX = 50;

/** Statuses the counselor still has to hold: a rescheduled session is as upcoming as a confirmed one. */
export const UPCOMING_SESSION_STATUSES = ["confirmed", "rescheduled"];

/**
 * audit 2026-10-09 D4: the counselor Sessions page asked for `limit: 100` (clamped to 50) and read
 * upcoming/completed/cancelled counts the API never returns, so the stat cards were blank and sessions past the 50th
 * were missing. The counts now come from the full list.
 */
/** Still to come: confirmed or rescheduled and not yet started — the same rule as the API's upcoming count. */
export function isUpcomingSession(s: { status: string; startTime?: string }, nowMs: number = Date.now()): boolean {
  if (!UPCOMING_SESSION_STATUSES.includes(s.status)) return false;
  return !s.startTime || new Date(s.startTime).getTime() >= nowMs;
}

export function sessionCounts(sessions: { status: string; startTime?: string }[], nowMs: number = Date.now()) {
  return {
    total: sessions.length,
    upcoming: sessions.filter((s) => isUpcomingSession(s, nowMs)).length,
    completed: sessions.filter((s) => s.status === "completed").length,
    cancelled: sessions.filter((s) => s.status === "cancelled").length,
  };
}

export interface CounselorSession {
  id: string;
  counselorId: string;
  counselorName: string;
  counselorEmail: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "rescheduled" | "cancelled" | "completed";
  topic: string;
  notes: string;
  counselorNotes: string;
  meetingLink: string;
  cancellationReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  completedAt?: string;
  isFree: boolean;
  createdAt: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface CounselorAvailabilityResponse {
  id?: string;
  timezone: string;
  weeklySchedule: Array<{
    day: string;
    enabled: boolean;
    timeSlots: Array<{ start: string; end: string }>;
  }>;
}

// ============================================================
// School Counselors (student scope)
// ============================================================

export async function getSchoolCounselors(): Promise<{
  id: string;
  name: string;
  email: string;
  avatar?: string;
}[]> {
  const res = await apiRequest(`/api/v1/counselor/school`);
  return res.data ?? res;
}

// ============================================================
// Availability (counselor scope)
// ============================================================

export async function getCounselorAvailability(): Promise<CounselorAvailabilityResponse> {
  const res = await apiRequest(`/api/v1/counselor/me/availability`);
  return res.data ?? res;
}

export async function updateCounselorAvailability(payload: {
  timezone?: string;
  weeklySchedule: CounselorAvailabilityResponse["weeklySchedule"];
}): Promise<CounselorAvailabilityResponse> {
  const res = await apiRequest(`/api/v1/counselor/me/availability`, {
    method: "PUT",
    data: payload,
  });
  return res.data ?? res;
}

// ============================================================
// Slots (student books counselor)
// ============================================================

export async function getCounselorSlots(
  counselorId: string,
  date: string // yyyy-MM-dd
): Promise<{ slots: TimeSlot[]; counselorName: string }> {
  const res = await apiRequest(
    `/api/v1/counselor/${counselorId}/slots?date=${date}`
  );
  return res.data ?? res;
}

// ============================================================
// Booking (student books)
// ============================================================

export async function bookCounselorSession(
  counselorId: string,
  payload: { startTime: string; endTime?: string; topic?: string; notes?: string; meetingLink?: string }
): Promise<CounselorSession> {
  const res = await apiRequest(`/api/v1/counselor/${counselorId}/sessions`, {
    method: "POST",
    data: payload,
  });
  return res.data ?? res;
}

// ============================================================
// Student: List my counselor sessions
// ============================================================

export async function getStudentCounselorSessions(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: CounselorSession[]; total: number; page: number; totalPages: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.append("status", params.status);
  if (params?.page) q.append("page", params.page.toString());
  if (params?.limit) q.append("limit", params.limit.toString());
  const res = await apiRequest(`/api/v1/counselor/student/sessions?${q}`);
  return res.data ?? res;
}

/** Every counselor session of the calling student (pages through the 50-per-page endpoint). */
export async function getAllStudentCounselorSessions(): Promise<CounselorSession[]> {
  return fetchAllPages(async (page, limit) => {
    const res = await getStudentCounselorSessions({ page, limit });
    return { rows: res.data ?? [], totalPages: res.totalPages };
  }, { pageSize: SESSIONS_PAGE_MAX });
}

/** Every session of the calling counselor (pages through the 50-per-page endpoint). */
export async function getAllMyCounselorSessions(): Promise<CounselorSession[]> {
  return fetchAllPages(async (page, limit) => {
    const res = await getMyCounselorSessions({ page, limit });
    return { rows: res.data ?? [], totalPages: res.totalPages };
  }, { pageSize: SESSIONS_PAGE_MAX });
}

// ============================================================
// Counselor: List my sessions
// ============================================================

export async function getMyCounselorSessions(params?: {
  status?: string;
  /** Only sessions still to come (confirmed or rescheduled, from now on), soonest first. */
  upcoming?: boolean;
  page?: number;
  limit?: number;
}): Promise<{
  data: CounselorSession[];
  total: number;
  page: number;
  totalPages: number;
  upcoming: number;
  completed: number;
  cancelled: number;
}> {
  const q = new URLSearchParams();
  if (params?.status) q.append("status", params.status);
  if (params?.upcoming) q.append("upcoming", "true");
  if (params?.page) q.append("page", params.page.toString());
  if (params?.limit) q.append("limit", params.limit.toString());
  const res = await apiRequest(`/api/v1/counselor/me/sessions?${q}`);
  return res.data ?? res;
}

// ============================================================
// Session Actions
// ============================================================

export async function completeCounselorSession(
  id: string,
  counselorNotes?: string
): Promise<{ id: string; status: string }> {
  const res = await apiRequest(
    `/api/v1/counselor/me/sessions/${id}/complete`,
    { method: "PUT", data: { counselorNotes } }
  );
  return res.data ?? res;
}

export async function cancelCounselorSession(
  id: string,
  reason?: string
): Promise<{ id: string; status: string }> {
  const res = await apiRequest(`/api/v1/counselor/sessions/${id}/cancel`, {
    method: "PUT",
    data: { reason },
  });
  return res.data ?? res;
}

export async function rescheduleCounselorSession(
  id: string,
  newStartTime: string,
  newEndTime?: string
): Promise<{ id: string; status: string; startTime: string; endTime: string }> {
  const res = await apiRequest(
    `/api/v1/counselor/sessions/${id}/reschedule`,
    { method: "PUT", data: { startTime: newStartTime, endTime: newEndTime } }
  );
  return res.data ?? res;
}
