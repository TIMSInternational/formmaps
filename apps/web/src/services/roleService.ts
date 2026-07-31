// Role service for handling role-related API calls
import { apiRequest } from "@/lib/api/apiClient";

export interface Role {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface UserWithRole {
  id: string;
  name: string;
  email: string;
  roleId: string;
  role?: Role;
}

// Get all roles
export async function getAllRoles(): Promise<Role[]> {
  const res = await apiRequest("/api/role");
  return res.data ?? res;
}

// Get active roles only
export async function getActiveRoles(): Promise<Role[]> {
  const res = await apiRequest("/api/role/active");
  return res.data ?? res;
}

// Get role by ID
export async function getRoleById(roleId: string): Promise<Role> {
  const res = await apiRequest(`/api/role/${roleId}`);
  return res.data ?? res;
}

// Get role by name
export async function getRoleByName(roleName: string): Promise<Role> {
  const res = await apiRequest(`/api/role/name/${roleName}`);
  return res.data ?? res;
}

// Test function to explore what the APIs return
export async function testRoleAPIs(): Promise<void> {
  try {

    // Test get all roles
    try {
      const allRoles = await getAllRoles();
    } catch (error) {
      // error handled silently
    }

    // Test get active roles
    try {
      const activeRoles = await getActiveRoles();
    } catch (error) {
      // error handled silently
    }

    // Test get role by name (try common role names)
    const commonRoleNames = ["Admin", "User", "SuperAdmin", "admin", "user"];
    for (const roleName of commonRoleNames) {
      try {
        const role = await getRoleByName(roleName);
      } catch (error) {
      // error handled silently
    }
    }
  } catch (error) {
      // error handled silently
    }
}
