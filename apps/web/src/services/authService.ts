// Auth service — powered by FormMaps API (Node.js + Prisma backend)
import { storeTokens, clearTokens } from "@/services/tokenRefreshService";
import { applyLanguage } from "@/lib/i18n/useSetLanguage";
import { authApiErrorFrom } from "@/lib/auth/authErrors";
import type { SignupLegalConsentPayload } from "@/lib/legal/consent";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export interface LoginResponse {
  token: string;
  refreshToken?: string;
  user: {
    id: string;
    name: string;
    email: string;
    roleId: string;
    roleName?: string;
    schoolId?: string;
    profilePicture?: string;
    avatarUrl?: string;
    avatar?: string;
    image?: string;
    permissions?: string[];
    role?: {
      id: string;
      name: string;
      description: string;
      isActive: boolean;
    };
  };
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  roleId: string;
  schoolId?: string;
  permissions?: string[];
  role?: {
    id: string;
    name: string;
    description: string;
    isActive: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/authapi/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    // Carries the API's status + code so the login page can explain it in the user's language.
    throw await authApiErrorFrom(response, "Invalid email or password");
  }

  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.message || "Login failed");
  }

  const { token, refreshToken, user, language } = result.data;

  // Apply the user's preferred language immediately on login (write-free — no PUT back).
  if (language === "en" || language === "es") {
    applyLanguage(language);
  }

  // Store tokens for auto-refresh
  if (refreshToken) {
    const decoded = decodeJWTToken(token);
    const expiresIn = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;
    storeTokens({ accessToken: token, refreshToken, expiresIn });
  }

  const roleName = user.roleName || "student";

  return {
    token,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      roleName,
      schoolId: user.schoolId || undefined,
      avatarUrl: user.avatarUrl || undefined,
      permissions: user.permissions || [],
      role: {
        id: user.roleId,
        name: roleName,
        description: `${roleName} role`,
        isActive: true,
      },
    },
  };
}

export async function signUp(
  name: string,
  email: string,
  password: string,
  roleId?: string,
  dateOfBirth?: string,
  acceptMarketing?: boolean,
  /** Versioned record of the legal documents accepted at signup (see @/lib/legal/consent). */
  legalConsent?: SignupLegalConsentPayload
): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/authapi/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, email, password, roleId, dateOfBirth, acceptMarketing, legalConsent }),
  });

  if (!response.ok) {
    throw await authApiErrorFrom(response, "Signup failed");
  }

  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.message || "Signup failed");
  }

  const { token, refreshToken, user } = result.data;

  if (refreshToken) {
    const decoded = decodeJWTToken(token);
    const expiresIn = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;
    storeTokens({ accessToken: token, refreshToken, expiresIn });
  }

  const roleName = user.roleName || "student";

  return {
    token,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      roleName,
      schoolId: user.schoolId || undefined,
      permissions: user.permissions || [],
      role: {
        id: user.roleId,
        name: roleName,
        description: `${roleName} role`,
        isActive: true,
      },
    },
  };
}

/**
 * Get current user profile. With cookie-based auth, we can no longer decode
 * the JWT from localStorage. This calls the /api/v1/user/me endpoint.
 * For synchronous access to user data, use useGlobalStore().user instead.
 */
export async function getCurrentUser(): Promise<UserProfile> {
  const { apiRequest } = await import("@/lib/api/apiClient");
  const result = await apiRequest("/api/v1/user/me");
  const user = result?.data || result;
  const role = user.role?.name || user.roleName || "student";

  return {
    id: user.id || "unknown",
    name: user.name || "User",
    email: user.email || "",
    roleId: user.roleId || role,
    schoolId: user.schoolId || "",
    permissions: user.permissions || [],
    role: {
      id: user.roleId || role,
      name: role,
      description: `${role} role`,
      isActive: true,
    },
  };
}

export function decodeJWTToken(token: string): { exp?: number; iat?: number; [key: string]: unknown } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const paddedPayload = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decodedPayload = atob(paddedPayload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodedPayload);
  } catch {
    return null;
  }
}

export function isAdminRole(roleName: string): boolean {
  const lower = (roleName || "").trim().toLowerCase();
  return (
    lower === "super admin" || lower === "super_admin" || lower === "superadmin" ||
    lower === "admin" || lower === "school_admin" || lower === "schooladmin"
  );
}

export function isSuperAdminRole(roleName: string): boolean {
  const lower = (roleName || "").trim().toLowerCase();
  return lower === "super admin" || lower === "super_admin" || lower === "superadmin";
}

export async function logout(): Promise<void> {
  try {
    // Revoke all refresh tokens on the backend (cookies sent automatically)
    await fetch(`${API_BASE}/authapi/refresh`, {
      method: "DELETE",
      credentials: "include",
      // Forced sign-outs navigate away immediately; keepalive lets the revoke finish anyway.
      keepalive: true,
    }).catch(() => {}); // Best-effort
  } finally {
    clearTokens();
  }
}
