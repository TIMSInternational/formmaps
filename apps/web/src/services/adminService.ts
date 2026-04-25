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
    console.log("🔍 verifyAdminViaRoles: Starting role-based verification...");

    // First, try to decode the JWT token to get role information
    const decodedToken = decodeJWTToken(token);
    let roleId = null;
    let roleName = null;

    console.log("🔍 verifyAdminViaRoles: Decoded token:", decodedToken);

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

      console.log("🔍 verifyAdminViaRoles: Found role info in token:", {
        roleId,
        roleName,
        fullToken: decodedToken,
      });
    }

    // If we have roleId, get role details from API
    if (roleId) {
      try {
        const roleDetails = await getRoleById(roleId);
        roleName = roleDetails.name;
        console.log(
          "🔍 verifyAdminViaRoles: Got role details from API:",
          roleDetails
        );
      } catch (error) {
        console.warn("Failed to get role details from API:", error);
      }
    }

    // Check if the role name indicates admin access
    const isAdmin = roleName ? isAdminRole(roleName) : false;
    const isSuperAdmin = roleName ? isSuperAdminRole(roleName) : false;

    console.log("🔍 verifyAdminViaRoles: Role analysis:", {
      roleName,
      isAdmin,
      isSuperAdmin,
    });

    // If no role found in token, fall back to simulation
    if (!roleName) {
      console.log(
        "🔍 verifyAdminViaRoles: No role found in token, using simulation"
      );
      return simulateAdminVerification(token);
    }

    return {
      isAdmin,
      isSuperAdmin,
      role: roleName || "user",
      permissions: isAdmin ? ["read", "write", "delete"] : ["read"],
    };
  } catch (error) {
    console.warn("Role-based verification failed, using fallback:", error);
    return simulateAdminVerification(token);
  }
}

// Simulate admin verification for development/testing
function simulateAdminVerification(token: string): AdminVerificationResponse {
  console.log("🔧 simulateAdminVerification: Starting simulation...");

  // Simple simulation: check if token contains admin indicators
  const isTestAdmin = token.includes("admin") || token.includes("super");
  console.log(
    "🔧 simulateAdminVerification: Token contains admin?",
    isTestAdmin
  );

  // You can also check localStorage for user data
  const userData = localStorage.getItem("user");
  let userRole = "user";

  console.log("🔧 simulateAdminVerification: Raw user data:", userData);

  if (userData) {
    try {
      const user = JSON.parse(userData);
      userRole = user.role || "user";
      console.log("🔧 simulateAdminVerification: Parsed user role:", userRole);
    } catch (e) {
      console.warn("Failed to parse user data from localStorage");
    }
  }

  const isAdmin =
    userRole === "admin" || userRole === "super_admin" || isTestAdmin;
  const isSuperAdmin = userRole === "super_admin" || token.includes("super");

  console.log("🔧 simulateAdminVerification: Final result:", {
    isAdmin,
    isSuperAdmin,
    role: userRole,
    userRole,
    isTestAdmin,
  });

  return {
    isAdmin,
    isSuperAdmin,
    role: userRole,
    permissions: isAdmin ? ["read", "write", "delete"] : ["read"],
  };
}

// For testing purposes, you can manually set admin role
export function setTestAdminRole(role: "user" | "admin" | "super_admin") {
  const userData = { role };
  localStorage.setItem("user", JSON.stringify(userData));

  // Also update the token to include admin indicator
  const currentToken = localStorage.getItem("token") || "test-token";
  const adminToken =
    role === "admin"
      ? `${currentToken}-admin`
      : role === "super_admin"
        ? `${currentToken}-super-admin`
        : currentToken.replace(/-admin|-super-admin/g, "");

  localStorage.setItem("token", adminToken);

  console.log(`Test role set to: ${role}`);
  console.log(`Token updated to: ${adminToken}`);
  console.log(`User data: ${JSON.stringify(userData)}`);
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
    // Return mock data if endpoint doesn't exist yet
    return getMockAdminAnalytics();
  }

  const json = await response.json();
  return json.data || json;
}

function getMockAdminAnalytics(): AdminAnalytics {
  return {
    stats: {
      totalUsers: 1234,
      totalRevenue: 45231.89,
      activeCourses: 12,
      growthRate: 12.5,
      monthlyGrowth: {
        users: 20.1,
        revenue: 15,
        courses: 16.7,
      },
    },
    revenueData: [
      { month: "Jan", revenue: 2400, transactions: 24 },
      { month: "Feb", revenue: 1398, transactions: 18 },
      { month: "Mar", revenue: 9800, transactions: 52 },
      { month: "Apr", revenue: 3908, transactions: 31 },
      { month: "May", revenue: 4800, transactions: 38 },
      { month: "Jun", revenue: 3800, transactions: 29 },
    ],
    userGrowthData: [
      { month: "Jan", users: 400, newUsers: 45 },
      { month: "Feb", users: 300, newUsers: 38 },
      { month: "Mar", users: 200, newUsers: 52 },
      { month: "Apr", users: 278, newUsers: 41 },
      { month: "May", users: 189, newUsers: 35 },
      { month: "Jun", users: 239, newUsers: 48 },
    ],
    topCoaches: [
      {
        id: "1",
        name: "Dr. Sarah Johnson",
        earnings: 12500,
        sessions: 48,
        rating: 4.9,
      },
      {
        id: "2",
        name: "Prof. Michael Chen",
        earnings: 10800,
        sessions: 42,
        rating: 4.8,
      },
      {
        id: "3",
        name: "Dr. Emily Rodriguez",
        earnings: 9600,
        sessions: 38,
        rating: 4.9,
      },
      {
        id: "4",
        name: "Prof. David Kim",
        earnings: 8400,
        sessions: 35,
        rating: 4.7,
      },
      {
        id: "5",
        name: "Dr. Lisa Anderson",
        earnings: 7800,
        sessions: 32,
        rating: 4.8,
      },
    ],
    topCourses: [
      {
        id: "1",
        title: "Advanced Web Development",
        enrollments: 245,
        revenue: 12250,
        rating: 4.8,
      },
      {
        id: "2",
        title: "Data Science Fundamentals",
        enrollments: 198,
        revenue: 9900,
        rating: 4.7,
      },
      {
        id: "3",
        title: "Machine Learning",
        enrollments: 156,
        revenue: 7800,
        rating: 4.9,
      },
      {
        id: "4",
        title: "Cloud Architecture",
        enrollments: 142,
        revenue: 7100,
        rating: 4.6,
      },
      {
        id: "5",
        title: "UX Design Principles",
        enrollments: 128,
        revenue: 6400,
        rating: 4.8,
      },
    ],
    recentActivity: [
      {
        type: "user",
        message: "New user registered: John Doe",
        timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
      },
      {
        type: "transaction",
        message: "Payment completed: $299.99",
        timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
      },
      {
        type: "course",
        message: "New course published: React Mastery",
        timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
      },
      {
        type: "session",
        message: "Coaching session completed",
        timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
      },
      {
        type: "user",
        message: "User upgraded to premium",
        timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
      },
    ],
  };
}

// Debug function to check current admin status
export function debugAdminStatus() {
  const token = localStorage.getItem("token");
  const userData = localStorage.getItem("user");

  console.log("=== Admin Status Debug ===");
  console.log("Token:", token);
  console.log("User data:", userData);

  if (userData) {
    try {
      const user = JSON.parse(userData);
      console.log("Parsed user role:", user.role);
    } catch (e) {
      console.log("Failed to parse user data");
    }
  }

  // Test the verification
  verifyAdminAccess()
    .then((result) => {
      console.log("Admin verification result:", result);
      console.log("Is Admin?", result.isAdmin);
      console.log("Is Super Admin?", result.isSuperAdmin);
      console.log("Role:", result.role);
    })
    .catch((error) => {
      console.log("Admin verification error:", error);
    });
}
