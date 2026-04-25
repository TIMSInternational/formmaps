import { UserProfile, UserActivity, UserSettings } from "../types/user";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

// Helper to get token
const getToken = () => localStorage.getItem("token");

// Helper for headers
const getHeaders = (isMultipart = false) => {
  const headers: HeadersInit = {
    Authorization: `Bearer ${getToken()}`,
  };
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

// User Profile APIs
export async function getUserProfile(): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/api/v1/user/profile`, {
    headers: getHeaders(),
  });

  if (!response.ok) throw new Error("Failed to fetch user profile");
  const json = await response.json();
  return json.data || json;
}

export async function updateUserProfile(
  profileData: Partial<UserProfile>
): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/api/v1/user/profile`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(profileData),
  });

  if (!response.ok) throw new Error("Failed to update user profile");
  const json = await response.json();
  return json.data || json;
}

export async function uploadProfileAvatar(
  file: File
): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/user/profile/avatar`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
    body: formData,
  });

  if (!response.ok) throw new Error("Failed to upload avatar");
  const json = await response.json();
  return { avatarUrl: json.url || json.data?.url || json.avatarUrl || "" };
}

export async function uploadProfileCover(
  file: File
): Promise<{ coverUrl: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/user/profile/cover`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
    body: formData,
  });

  if (!response.ok) throw new Error("Failed to upload cover");
  const json = await response.json();
  return { coverUrl: json.url || json.data?.url || json.coverUrl || "" };
}

export async function getUserActivity(): Promise<UserActivity[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/user/activity`, {
    headers: getHeaders(),
  });

  if (!response.ok) throw new Error("Failed to fetch user activity");
  const json = await response.json();
  return json.data || json;
}

// Session Analytics Interface and API
export interface SessionAnalytics {
  totalSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  upcomingSessions: number;
  averageRating: number;
  totalDuration: number; // in minutes
  topCoaches: Array<{ coachId: string; name: string; sessions: number }>;
  monthlyTrend: Array<{ month: string; sessions: number }>;
}

/**
 * Get user's personal session statistics and analytics.
 * Includes total sessions, ratings, top coaches, and monthly trends.
 */
export async function getSessionAnalytics(): Promise<SessionAnalytics> {
  const response = await fetch(`${API_BASE_URL}/api/v1/user/sessions/analytics`, {
    headers: getHeaders(),
  });

  if (!response.ok) throw new Error("Failed to fetch session analytics");
  const json = await response.json();
  return json.data || json;
}

export async function updateUserSettings(
  settings: Partial<UserSettings>
): Promise<UserSettings> {
  const response = await fetch(`${API_BASE_URL}/api/v1/user/settings`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(settings),
  });

  if (!response.ok) throw new Error("Failed to update user settings");
  const json = await response.json();
  return json.data || json;
}
