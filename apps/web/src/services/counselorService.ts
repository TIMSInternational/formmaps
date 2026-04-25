const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

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

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.error?.message || err.message || "Request failed");
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

// Counselor dashboard (counselor-scoped)
export async function getCounselorDashboard(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/counselor/dashboard`, {
    headers: getHeaders(),
  });
  return handleResponse<any>(res);
}

// Counselor dashboard: pending change requests across all assigned students
export async function getCounselorDashboardChangeRequests(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/counselor/dashboard/change-requests?limit=30`, {
    headers: getHeaders(),
  });
  return handleResponse<any>(res);
}

// ============================================
// Counselor Onboarding
// ============================================

export interface CounselorTokenVerifyResponse {
  email: string;
  invitedBy: string;
  assignAll: boolean;
  assignedStudentCount: number;
  schoolName?: string;
}

export interface CounselorOnboardingPayload {
  token: string;
  password: string;
  name: string;
  // Sent flat (not wrapped in profile object) — confirmed from backend Postman collection
  phone?: string;
  timezone?: string;
}

export interface CounselorOnboardingResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    schoolId: string;
  };
}

export async function verifyCounselorToken(
  token: string
): Promise<CounselorTokenVerifyResponse> {
  const url = `${API_BASE}/api/v1/counselor/onboarding/verify?token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  return handleResponse<CounselorTokenVerifyResponse>(res);
}

export async function completeCounselorOnboarding(
  payload: CounselorOnboardingPayload
): Promise<CounselorOnboardingResult> {
  const res = await fetch(`${API_BASE}/api/v1/counselor/onboarding/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<CounselorOnboardingResult>(res);
}