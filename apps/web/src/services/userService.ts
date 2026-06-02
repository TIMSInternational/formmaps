import { UserProfile, UserActivity, UserSettings } from "../types/user";
import { apiRequest } from "@/lib/api/apiClient";

// User Profile APIs
export async function getUserProfile(): Promise<UserProfile> {
  const res = await apiRequest("/api/v1/user/profile");
  return res.data || res;
}

export async function updateUserProfile(
  profileData: Partial<UserProfile>
): Promise<UserProfile> {
  const res = await apiRequest("/api/v1/user/profile", {
    method: "PUT",
    data: profileData,
  });
  return res.data || res;
}

export async function uploadProfileAvatar(
  file: File
): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiRequest("/api/v1/upload/profile-image", {
    method: "POST",
    data: formData,
    headers: { "Content-Type": "multipart/form-data" },
  });
  return { avatarUrl: res.url || res.data?.url || res.avatarUrl || "" };
}

export async function uploadProfileCover(
  file: File
): Promise<{ coverUrl: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiRequest("/api/v1/upload/profile-image", {
    method: "POST",
    data: formData,
    headers: { "Content-Type": "multipart/form-data" },
  });
  return { coverUrl: res.url || res.data?.url || res.coverUrl || "" };
}

export async function getUserActivity(): Promise<UserActivity[]> {
  const res = await apiRequest("/api/v1/user/activity");
  return res.data || res;
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
  const res = await apiRequest("/api/v1/user/sessions/analytics");
  return res.data || res;
}

export async function updateUserSettings(
  settings: Partial<UserSettings>
): Promise<UserSettings> {
  const res = await apiRequest("/api/v1/user/settings", {
    method: "PUT",
    data: settings,
  });
  return res.data || res;
}
