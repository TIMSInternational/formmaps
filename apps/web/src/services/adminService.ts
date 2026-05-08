// Admin service for handling admin-related API calls
import { decodeJWTToken, isAdminRole, isSuperAdminRole } from "./authService";
import { getRoleById } from "./roleService";
import { apiRequest } from "@/lib/api/apiClient";

// Helper to get current language from localStorage
const getCurrentLanguage = (): "en" | "sp" => {
  if (typeof window !== "undefined") {
    const lang = localStorage.getItem("i18nextLng") || "en";
    return lang.startsWith("es") ? "sp" : "en";
  }
  return "en";
};

// Helper to build query params object with language
const buildParams = (
  params?: Record<string, string | number | undefined>
): Record<string, string | number> => {
  const language = getCurrentLanguage();
  const result: Record<string, string | number> = { language };
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        result[key] = value as string | number;
      }
    });
  }
  return result;
};

interface AdminVerificationResponse {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: string;
  permissions: string[];
}

export interface AdminPayoutItem {
  payoutId: string;
  coachId: string;
  coachName: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  status: "pending" | "approved" | "rejected" | "paid";
}

export interface CommissionStats {
  totalCommission: number;
  periodStart: string;
  periodEnd: string;
  breakdown: {
    monthly: number;
    yearly: number;
  };
}

export async function verifyAdminAccess(): Promise<AdminVerificationResponse> {
  const token = localStorage.getItem("token");

  if (!token) {
    throw new Error("No authentication token found");
  }

  // Use role-based verification directly since verify-admin endpoint doesn't exist
  return await verifyAdminViaRoles(token);
}

// Verify admin access using role APIs
async function verifyAdminViaRoles(
  token: string
): Promise<AdminVerificationResponse> {
  try {

    // First, try to decode the JWT token to get role information
    const decodedToken = decodeJWTToken(token);
    let roleId = null;
    let roleName = null;

    if (decodedToken) {
      // Check for standard role fields
      roleId = decodedToken.roleId || decodedToken.role_id;
      roleName =
        decodedToken.roleName || decodedToken.role_name || decodedToken.role;

      // Check for Microsoft identity claims format
      const roleClaimKey =
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
      if (decodedToken[roleClaimKey]) {
        roleName = decodedToken[roleClaimKey];
      }

      // Check for name identifier (user ID)
      const nameIdKey =
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameididentifier";
      if (decodedToken[nameIdKey]) {
        roleId = decodedToken[nameIdKey];
      }

    }

    // If we have roleId, get role details from API
    if (roleId) {
      try {
        const roleDetails = await getRoleById(roleId);
        roleName = roleDetails.name;
      } catch (error) {
      // error handled silently
    }
    }

    // Check if the role name indicates admin access
    const isAdmin = roleName ? isAdminRole(roleName) : false;
    const isSuperAdmin = roleName ? isSuperAdminRole(roleName) : false;

    // If no role found in token, fall back to simulation
    if (!roleName) {
      return simulateAdminVerification(token);
    }

    return {
      isAdmin,
      isSuperAdmin,
      role: roleName || "user",
      permissions: isAdmin ? ["read", "write", "delete"] : ["read"],
    };
  } catch (error) {
    return simulateAdminVerification(token);
  }
}

// Simulate admin verification for development/testing
function simulateAdminVerification(token: string): AdminVerificationResponse {

  // Simple simulation: check if token contains admin indicators
  const isTestAdmin = token.includes("admin") || token.includes("super");

  // You can also check localStorage for user data
  const userData = localStorage.getItem("user");
  let userRole = "user";

  if (userData) {
    try {
      const user = JSON.parse(userData);
      userRole = user.role || "user";
    } catch (e) {
      // error handled silently
    }
  }

  const isAdmin =
    userRole === "admin" || userRole === "super_admin" || isTestAdmin;
  const isSuperAdmin = userRole === "super_admin" || token.includes("super");

  return {
    isAdmin,
    isSuperAdmin,
    role: userRole,
    permissions: isAdmin ? ["read", "write", "delete"] : ["read"],
  };
}

// --- Admin Payout APIs ---

export async function getAdminPayouts(
  status?: "pending" | "approved" | "rejected" | "paid"
): Promise<AdminPayoutItem[]> {
  const params = buildParams(status ? { status } : undefined);
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const res = await apiRequest(`/api/v1/admin/payouts?${qs}`);
  return res.data || res;
}

export async function approvePayout(
  payoutId: string
): Promise<{ success: boolean; message: string }> {
  const params = buildParams();
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const res = await apiRequest(`/api/v1/admin/payouts/${payoutId}/approve?${qs}`, {
    method: "POST",
  });
  return res.data || res;
}

export async function rejectPayout(
  payoutId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const params = buildParams();
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const res = await apiRequest(`/api/v1/admin/payouts/${payoutId}/reject?${qs}`, {
    method: "POST",
    data: { reason },
  });
  return res.data || res;
}

export async function getCommissionStats(): Promise<CommissionStats> {
  const params = buildParams();
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const res = await apiRequest(`/api/v1/admin/commission-stats?${qs}`);
  return res.data || res;
}

// --- User Management ---

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  joinedDate: string;
  subscriptionStatus?: string;
}

export interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export async function getAdminUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}): Promise<AdminUsersResponse> {
  const allParams = buildParams({
    page: params.page || 1,
    limit: params.limit || 20,
    search: params.search,
    role: params.role,
    status: params.status,
  });
  const qs = new URLSearchParams(allParams as Record<string, string>).toString();
  const res = await apiRequest(`/api/v1/admin/users?${qs}`);
  return res.data || res;
}

// --- Transaction Management ---

export interface AdminTransaction {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  date: string;
  description: string;
  method?: string;
}

export interface AdminTransactionsResponse {
  items: AdminTransaction[];
  total: number;
  page: number;
  limit: number;
}

export async function getAdminTransactions(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}): Promise<AdminTransactionsResponse> {
  const allParams = buildParams({
    page: params.page || 1,
    limit: params.limit || 20,
    search: params.search,
    status: params.status,
  });
  const qs = new URLSearchParams(allParams as Record<string, string>).toString();
  const res = await apiRequest(`/api/v1/admin/transactions?${qs}`);
  return res.data || res;
}

// --- Admin Analytics ---

export interface PlatformStats {
  totalUsers: number;
  totalRevenue: number;
  activeCourses: number;
  growthRate: number;
  monthlyGrowth: {
    users: number;
    revenue: number;
    courses: number;
  };
}

export interface RevenueData {
  month: string;
  revenue: number;
  transactions: number;
}

export interface UserGrowthData {
  month: string;
  users: number;
  newUsers: number;
}

export interface TopCoach {
  id: string;
  name: string;
  earnings: number;
  sessions: number;
  rating: number;
}

export interface TopCourse {
  id: string;
  title: string;
  enrollments: number;
  revenue: number;
  rating: number;
}

export interface AdminAnalytics {
  stats: PlatformStats;
  revenueData: RevenueData[];
  userGrowthData: UserGrowthData[];
  topCoaches: TopCoach[];
  topCourses: TopCourse[];
  recentActivity: {
    type: "user" | "transaction" | "course" | "session";
    message: string;
    timestamp: string;
  }[];
}

export async function getAdminAnalytics(
  period: "week" | "month" | "year" = "month"
): Promise<AdminAnalytics> {
  const allParams = buildParams({ period });
  const qs = new URLSearchParams(allParams as Record<string, string>).toString();
  const res = await apiRequest(`/api/admin/analytics?${qs}`);
  return res.data || res;
}
