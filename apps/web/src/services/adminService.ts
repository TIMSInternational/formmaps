// Admin service for handling admin-related API calls
import { decodeJWTToken, isAdminRole, isSuperAdminRole } from "./authService";
import { getRoleById } from "./roleService";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

// Helper to get current language from localStorage
const getCurrentLanguage = (): "en" | "sp" => {
  if (typeof window !== "undefined") {
    const lang = localStorage.getItem("i18nextLng") || "en";
    return lang.startsWith("es") ? "sp" : "en";
  }
  return "en";
};

// Helper to build URL with language parameter
const buildUrl = (
  endpoint: string,
  params?: Record<string, string | number | undefined>
) => {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  const language = getCurrentLanguage();
  url.searchParams.append("language", language);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
};

// Helper to get token
const getToken = () => localStorage.getItem("token");

// Helper for headers
const getHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

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
        decodedToken["custom:role"] || decodedToken.roleName || decodedToken.role_name || decodedToken.role;

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
  const url = buildUrl("/api/v1/admin/payouts", status ? { status } : undefined);

  const response = await fetch(url, {
    headers: getHeaders(),
  });

  if (!response.ok) throw new Error("Failed to fetch payouts");
  const json = await response.json();
  return json.data || json;
}

export async function approvePayout(
  payoutId: string
): Promise<{ success: boolean; message: string }> {
  const url = buildUrl(`/api/v1/admin/payouts/${payoutId}/approve`);
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
  }
  );

  if (!response.ok) throw new Error("Failed to approve payout");
  const json = await response.json();
  return json.data || json;
}

export async function rejectPayout(
  payoutId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const url = buildUrl(`/api/v1/admin/payouts/${payoutId}/reject`);
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ reason }),
  }
  );

  if (!response.ok) throw new Error("Failed to reject payout");
  const json = await response.json();
  return json.data || json;
}

export async function getCommissionStats(): Promise<CommissionStats> {
  const url = buildUrl("/api/v1/admin/commission-stats");
  const response = await fetch(url, {
    headers: getHeaders(),
  }
  );

  if (!response.ok) throw new Error("Failed to fetch commission stats");
  const json = await response.json();
  return json.data || json;
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
  const url = buildUrl("/api/v1/admin/users", {
    page: params.page || 1,
    limit: params.limit || 20,
    search: params.search,
    role: params.role,
    status: params.status,
  });

  const response = await fetch(url,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) throw new Error("Failed to fetch users");
  const json = await response.json();
  return json.data || json;
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
  const url = buildUrl("/api/v1/admin/transactions", {
    page: params.page || 1,
    limit: params.limit || 20,
    search: params.search,
    status: params.status,
  });

  const response = await fetch(url, {
    headers: getHeaders(),
  }
  );

  if (!response.ok) throw new Error("Failed to fetch transactions");
  const json = await response.json();
  return json.data || json;
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
  const url = buildUrl("/api/admin/analytics", { period });
  const response = await fetch(url, {
    headers: getHeaders(),
  }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch admin analytics");
  }

  const json = await response.json();
  return json.data || json;
}
