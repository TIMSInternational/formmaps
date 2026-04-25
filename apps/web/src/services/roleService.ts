// Role service for handling role-related API calls

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
  const token = localStorage.getItem("token");

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/roleapi`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch roles: ${response.statusText}`);
  }

  return await response.json();
}

// Get active roles only
export async function getActiveRoles(): Promise<Role[]> {
  const token = localStorage.getItem("token");

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/roleapi/active`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch active roles: ${response.statusText}`);
  }

  return await response.json();
}

// Get role by ID
export async function getRoleById(roleId: string): Promise<Role> {
  const token = localStorage.getItem("token");

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/roleapi/${roleId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch role: ${response.statusText}`);
  }

  return await response.json();
}

// Get role by name
export async function getRoleByName(roleName: string): Promise<Role> {
  const token = localStorage.getItem("token");

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/roleapi/name/${roleName}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch role by name: ${response.statusText}`);
  }

  return await response.json();
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
