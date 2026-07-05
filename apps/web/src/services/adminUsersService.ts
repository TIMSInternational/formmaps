import { apiRequest } from "@/lib/api/apiClient";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  joinedDate: string;
  subscriptionStatus: "active" | "expired" | "none";
}

export interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminUsersFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: "student" | "coach" | "admin";
}

/**
 * Get all users with pagination and filtering (Admin only)
 */
export async function getAdminUsers(
  filters: AdminUsersFilters = {}
): Promise<AdminUsersResponse> {
  const params = new URLSearchParams();
  params.append("page", (filters.page || 1).toString());
  params.append("limit", (filters.limit || 20).toString());
  params.append("search", filters.search || "");
  params.append("role", filters.role || "");
  params.append("status", filters.status || "");

  const response = await apiRequest(
    `/api/v1/admin/users?${params.toString()}`,
    {
      method: "GET",
    }
  );
  return response.data || response;
}

/**
 * Create a new user with an explicit role (Admin only).
 * Uses the admin endpoint (authed) — NOT public signup — so the selected role
 * is actually applied. apiRequest throws on non-2xx with the server message.
 */
export async function createUser(data: CreateUserData): Promise<AdminUser> {
  const response = await apiRequest("/api/v1/admin/users", {
    method: "POST",
    data,
  });
  return response?.data ?? response;
}

