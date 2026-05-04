// Auth service — now powered by AWS Cognito
import { cognitoLogin, cognitoSignUp, cognitoLogout, cognitoRefreshSession } from "@/lib/cognito";
import { RolePermissionMap } from "@/lib/permissions";

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    roleId: string;
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
  const result = await cognitoLogin(email, password);

  const permissions = RolePermissionMap[result.user.role] || [];

  return {
    token: result.idToken,
    user: {
      id: result.user.mongoId,
      name: result.user.name,
      email: result.user.email,
      roleId: result.user.role,
      schoolId: result.user.schoolId,
      permissions,
      role: {
        id: result.user.role,
        name: result.user.role,
        description: `${result.user.role} role`,
        isActive: true,
      },
    },
  };
}

export async function signUp(
  name: string,
  email: string,
  password: string,
  roleId?: string
): Promise<LoginResponse> {
  const role = roleId || "student";
  await cognitoSignUp(name, email, password, role);

  // After signup, auto-login to get tokens
  return login(email, password);
}

export function getCurrentUser(): Promise<UserProfile> {
  // Extract user profile from stored token (JWT decode)
  const token = localStorage.getItem("token");
  if (!token) throw new Error("No token found");

  const decoded = decodeJWTToken(token);
  if (!decoded) throw new Error("Invalid token");

  const role = decoded["custom:role"] || decoded.role || "student";
  const permissions = RolePermissionMap[role] || [];

  return Promise.resolve({
    id: decoded["custom:mongoId"] || decoded.sub || "unknown",
    name: decoded.name || "User",
    email: decoded.email || "user@example.com",
    roleId: role,
    schoolId: decoded["custom:schoolId"] || "",
    permissions,
    role: {
      id: role,
      name: role,
      description: `${role} role`,
      isActive: true,
    },
  });
}

export function decodeJWTToken(token: string): any {
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

export { cognitoLogout as logout, cognitoRefreshSession as refreshSession };
