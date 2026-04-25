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
  roleId?: string;
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
 * Create a new user (Admin only)
 */
export async function createUser(data: CreateUserData): Promise<AdminUser> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
  const response = await fetch(`${API_BASE_URL}/authapi/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText);
      // Handle ASP.NET validation errors format
      if (errorJson.errors) {
        const errorMessages = Object.entries(errorJson.errors)
          .map(([field, messages]) => {
            if (Array.isArray(messages)) {
              return messages.join(", ");
            }
            return String(messages);
          })
          .join("; ");
        throw new Error(errorMessages || "Validation failed");
      }
      throw new Error(errorJson.message || errorJson.title || "Failed to create user");
    } catch (e) {
      if (e instanceof Error && e.message !== errorText) {
        throw e;
      }
      throw new Error(errorText || "Failed to create user");
    }
  }

  const result = await response.json();
  return result.data || result;
}

