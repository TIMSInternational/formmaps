import {
  School,
  SchoolInvitePayload,
  SchoolsResponse,
  SchoolStats,
  SchoolAdminOnboardingStatus,
  SchoolAdminOnboardingData,
} from "@/types/school";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

// Helper to get token
const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token");
  }
  return null;
};

// Helper for headers
const getHeaders = () => {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
};

export async function getSchools(
  params: {
    page?: number;
    limit?: number;
    search?: string;
  } = {},
): Promise<SchoolsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.append("page", params.page.toString());
  if (params.limit) query.append("limit", params.limit.toString());
  if (params.search) query.append("search", params.search);

  // Fallback to empty response if API is not ready/mocking
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/admin/schools?${query.toString()}`,
      {
        headers: getHeaders(),
      },
    );

    if (!response.ok) {
      console.warn("getSchools API not found or error, returning mock data");
      throw new Error("Failed to fetch schools");
    }
    return response.json();
  } catch (e) {
    // Mock Data for development demonstration
    console.log("Using Mock Data for Schools");
    return {
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    };
  }
}

export async function inviteSchool(
  data: SchoolInvitePayload,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/schools/invite`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to invite school");
  }

  return response.json();
}

export async function updateSchool(
  schoolId: string,
  data: Partial<SchoolInvitePayload>,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/schools/${schoolId}`,
    {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to update school");
  }

  return response.json();
}

export async function resendSchoolInvite(
  schoolId: string,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/schools/${schoolId}/invite`,
    {
      method: "POST",
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to resend invitation");
  }

  return response.json();
}

export async function getSchoolStats(): Promise<SchoolStats> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/schools/stats`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error("Failed to fetch school stats");
    const json = await response.json();
    return json.data || json;
  } catch (error) {
    console.warn("getSchoolStats API failed, returning zeros");
    return {
      totalSchools: 0,
      activeSchools: 0,
      pendingInvites: 0,
      totalStudents: 0,
    };
  }
}

// ============================================
// School Admin Onboarding
// ============================================

export async function getSchoolAdminOnboardingStatus(
  token: string,
): Promise<SchoolAdminOnboardingStatus> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/school-admin/${token}/onboarding-status`,
  );
  if (!response.ok) throw new Error("Failed to get onboarding status");
  const json = await response.json();
  return json.data;
}

export async function submitSchoolAdminOnboarding(
  token: string,
  data: SchoolAdminOnboardingData,
): Promise<{ success: boolean; redirectUrl: string }> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/school-admin/${token}/onboarding`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) throw new Error("Failed to submit onboarding data");
  return response.json();
}
