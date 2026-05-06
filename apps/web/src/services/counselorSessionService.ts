const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

const getToken = () => (typeof window !== "undefined" ? localStorage.getItem("token") : null);

const getHeaders = (): HeadersInit => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.error?.message || err.message || "Request failed");
  }
  const json = await res.json();
  return (json.data ?? json) as T;
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
  status: "confirmed" | "cancelled" | "completed";
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
  const res = await fetch(`${API_BASE}/api/v1/counselor/school`, { headers: getHeaders() });
  return handleResponse(res);
}

// ============================================================
// Availability (counselor scope)
// ============================================================

export async function getCounselorAvailability(): Promise<CounselorAvailabilityResponse> {
  const res = await fetch(`${API_BASE}/api/v1/counselor/me/availability`, { headers: getHeaders() });
  return handleResponse<CounselorAvailabilityResponse>(res);
}

export async function updateCounselorAvailability(payload: {
  timezone?: string;
  weeklySchedule: CounselorAvailabilityResponse["weeklySchedule"];
}): Promise<CounselorAvailabilityResponse> {
  const res = await fetch(`${API_BASE}/api/v1/counselor/me/availability`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<CounselorAvailabilityResponse>(res);
}

// ============================================================
// Slots (student books counselor)
// ============================================================

export async function getCounselorSlots(
  counselorId: string,
  date: string // yyyy-MM-dd
): Promise<{ slots: TimeSlot[]; counselorName: string }> {
  const res = await fetch(
    `${API_BASE}/api/v1/counselor/${counselorId}/slots?date=${date}`,
    { headers: getHeaders() }
  );
  return handleResponse<{ slots: TimeSlot[]; counselorName: string }>(res);
}

// ============================================================
// Booking (student books)
// ============================================================

export async function bookCounselorSession(
  counselorId: string,
  payload: { startTime: string; endTime?: string; topic?: string; notes?: string; meetingLink?: string }
): Promise<CounselorSession> {
  const res = await fetch(`${API_BASE}/api/v1/counselor/${counselorId}/sessions`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<CounselorSession>(res);
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
  const res = await fetch(`${API_BASE}/api/v1/counselor/student/sessions?${q}`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

// ============================================================
// Counselor: List my sessions
// ============================================================

export async function getMyCounselorSessions(params?: {
  status?: string;
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
  if (params?.page) q.append("page", params.page.toString());
  if (params?.limit) q.append("limit", params.limit.toString());
  const res = await fetch(`${API_BASE}/api/v1/counselor/me/sessions?${q}`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

// ============================================================
// Session Actions
// ============================================================

export async function completeCounselorSession(
  id: string,
  counselorNotes?: string
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_BASE}/api/v1/counselor/me/sessions/${id}/complete`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ counselorNotes }),
  });
  return handleResponse(res);
}

export async function cancelCounselorSession(
  id: string,
  reason?: string
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_BASE}/api/v1/counselor/sessions/${id}/cancel`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

export async function rescheduleCounselorSession(
  id: string,
  newStartTime: string,
  newEndTime?: string
): Promise<{ id: string; status: string; startTime: string; endTime: string }> {
  const res = await fetch(`${API_BASE}/api/v1/counselor/sessions/${id}/reschedule`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ newStartTime, newEndTime }),
  });
  return handleResponse(res);
}
