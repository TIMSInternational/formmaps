import type {
  AcademicYear,
  AcademicYearPayload,
  AssessmentPeriod,
  AssessmentPeriodPayload,
  Holiday,
  HolidayPayload,
} from "@/types/calendar";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const getToken = () => {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
};

const getHeaders = (isMultipart = false) => {
  const token = getToken();
  const headers: HeadersInit = {
    Authorization: token ? `Bearer ${token}` : "",
  };
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

const buildUrl = (endpoint: string) => `${API_BASE_URL}${endpoint}`;

const handleResponse = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.error?.message || err.message || "Request failed");
  }
  const json = await res.json();
  if (json.data && json.data.data !== undefined) {
    return json.data.data as T;
  }
  return (json.data ?? json) as T;
};

// ============================================
// Academic Years (School Admin Calendar)
// ============================================

export async function getAcademicYears(): Promise<AcademicYear[]> {
  const res = await fetch(buildUrl("/api/v1/school-admin/calendar/academic-years"), {
    headers: getHeaders(),
  });
  return handleResponse<AcademicYear[]>(res);
}

export async function createAcademicYear(payload: AcademicYearPayload): Promise<AcademicYear> {
  const res = await fetch(buildUrl("/api/v1/school-admin/calendar/academic-years"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<AcademicYear>(res);
}

export async function updateAcademicYear(id: string, payload: Partial<AcademicYearPayload>): Promise<AcademicYear> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/calendar/academic-years/${id}`), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<AcademicYear>(res);
}

export async function deleteAcademicYear(id: string): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/calendar/academic-years/${id}`), {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete academic year");
}

// ============================================
// Assessment Periods (School Admin Calendar)
// ============================================

export async function getAssessmentPeriods(): Promise<AssessmentPeriod[]> {
  const res = await fetch(buildUrl("/api/v1/school-admin/calendar/assessment-periods"), {
    headers: getHeaders(),
  });
  return handleResponse<AssessmentPeriod[]>(res);
}

export async function createAssessmentPeriod(payload: AssessmentPeriodPayload): Promise<AssessmentPeriod> {
  const res = await fetch(buildUrl("/api/v1/school-admin/calendar/assessment-periods"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<AssessmentPeriod>(res);
}

export async function updateAssessmentPeriod(id: string, payload: Partial<AssessmentPeriodPayload>): Promise<AssessmentPeriod> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/calendar/assessment-periods/${id}`), {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<AssessmentPeriod>(res);
}

export async function deleteAssessmentPeriod(id: string): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/calendar/assessment-periods/${id}`), {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete assessment period");
}

// ============================================
// Holidays (School Admin Calendar)
// ============================================

export async function getHolidays(): Promise<Holiday[]> {
  const res = await fetch(buildUrl("/api/v1/school-admin/calendar/holidays"), {
    headers: getHeaders(),
  });
  return handleResponse<Holiday[]>(res);
}

export async function createHolidays(payload: HolidayPayload): Promise<Holiday[]> {
  const res = await fetch(buildUrl("/api/v1/school-admin/calendar/holidays"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<Holiday[]>(res);
}

export async function deleteHoliday(id: string): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/school-admin/calendar/holidays/${id}`), {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete holiday");
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

  const requestUrl = `${API_BASE_URL}/api/v1/coach/auth/${provider}/url${query.toString() ? `?${query.toString()}` : ""}`;

  const response = await fetch(requestUrl, { headers: getHeaders() });
  if (!response.ok) throw new Error(`Failed to get ${provider} auth URL`);

  const data = await response.json();
  const nested = data && typeof data === "object" ? data.data || data : data;
  const url = nested?.url || nested?.callbackurl || data?.url || data?.callbackurl;
  if (!url) {
    throw new Error(`API did not return a valid URL. Response: ${JSON.stringify(data)}`);
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
  const response = await fetch(
    `${API_BASE_URL}/api/v1/coach/auth/${provider}/status?email=${encodeURIComponent(email)}`,
    { headers: getHeaders() },
  );
  if (!response.ok) throw new Error(`Failed to check ${provider} auth status`);
  const json = await response.json();
  return json.data || json;
}

export async function disconnectCalendar(
  provider: "google" | "outlook",
  email?: string,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/coach/auth/${provider}/disconnect`,
    {
      method: "DELETE",
      headers: getHeaders(),
      body: email ? JSON.stringify({ email }) : undefined,
    },
  );
  if (!response.ok) throw new Error(`Failed to disconnect ${provider} calendar`);
  return response.json();
}
