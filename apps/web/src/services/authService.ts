// Auth service for handling authentication and user data
// Updated to include login function

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

// Test login to see what user data is returned
export async function testLogin(
  email: string,
  password: string
): Promise<LoginResponse> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/authapi/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    }
  );

  if (!response.ok) {
    throw new Error(`Login failed: ${response.statusText}`);
  }

  return await response.json();
}

// Get current user profile (if there's such an endpoint)
export async function getCurrentUser(): Promise<UserProfile> {
  const token = localStorage.getItem("token");

  if (token) {
    // To prevent 404 console spam on Azure where the profile endpoint is missing,
    // we extract the user profile directly from the JWT token first.
    const decoded = decodeJWTToken(token);

    if (decoded) {
      const roleName = decoded.role || decoded[
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
      ] || "staff";

      // Extract permissions from JWT (stored as JSON string)
      let permissions: string[] = [];
      try {
        if (decoded.permissions) {
          permissions = typeof decoded.permissions === "string"
            ? JSON.parse(decoded.permissions)
            : decoded.permissions;
        }
      } catch { /* ignore parse errors */ }

      return {
        id: decoded[
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
        ] || decoded.sub || decoded.id || "fallback-id",
        name: decoded[
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
        ] || decoded.name || "User",
        email: decoded[
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
        ] || decoded.email || "user@example.com",
        roleId: decoded.roleId || "role-id",
        schoolId: decoded.schoolId || "",
        permissions,
        role: {
          id: decoded.roleId || "role-id",
          name: roleName,
          description: "Role extracted from token",
          isActive: true
        }
      };
    }
  }

  throw new Error("User profile not found in token");
}

// Decode JWT token to see what's inside (client-side only for inspection)
export function decodeJWTToken(token: string): any {
  try {
    // Skip decoding for test tokens
    if (token.startsWith("test-token")) {
      return null;
    }

    // JWT tokens have 3 parts separated by dots
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT token format");
    }

    // Decode the payload (second part)
    const payload = parts[1];
    // Add padding if needed
    const paddedPayload = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decodedPayload = atob(
      paddedPayload.replace(/-/g, "+").replace(/_/g, "/")
    );

    return JSON.parse(decodedPayload);
  } catch (error) {
    return null;
  }
}

// Login function for authentication
export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {

  const requestBody = {
    email: email,
    password: password,
  };

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/authapi/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    // Try to parse error as JSON for better error messages
    try {
      const errorJson = JSON.parse(errorText);

      // Handle different error response formats
      if (errorJson.message) {
        // Use the message field if available
        throw new Error(errorJson.message);
      } else if (errorJson.errorMessage) {
        // Use errorMessage field if available
        throw new Error(errorJson.errorMessage);
      } else if (errorJson.errors) {
        // Handle validation errors
        const errorMessages = Object.values(errorJson.errors).flat();
        throw new Error(errorMessages.join(", "));
      } else {
        // Fallback to a generic message
        throw new Error("Invalid email or password. Please try again.");
      }
    } catch (parseError) {
      // If JSON parsing fails, provide a user-friendly message
      if (response.status === 401) {
        throw new Error("Invalid email or password. Please try again.");
      } else if (response.status === 404) {
        throw new Error("Account not found. Please check your email address.");
      } else if (response.status >= 500) {
        throw new Error("Server error. Please try again later.");
      } else {
        throw new Error("Login failed. Please try again.");
      }
    }
  }

  const result = await response.json();

  // Handle your API response format where token is inside 'data'
  if (result.data && result.data.token) {
    return {
      token: result.data.token,
      user: {
        id: result.data.user.id,
        name: result.data.user.name,
        email: result.data.user.email,
        roleId: result.data.user.roleId,
        profilePicture: result.data.user.profilePicture,
        avatarUrl: result.data.user.avatarUrl || result.data.user.avatar || result.data.user.profilePicture,
        permissions: result.data.user.permissions || [],
        role: {
          id: result.data.user.roleId,
          name: result.data.user.roleName,
          description: `${result.data.user.roleName} role`,
          isActive: true,
        },
      },
    };
  }

  // Fallback for direct token format
  return result;
}

// Check if user has admin role based on role name
export function isAdminRole(roleName: string): boolean {
  const lower = (roleName || "").trim().toLowerCase();
  return (
    lower === "super admin" || lower === "super_admin" || lower === "superadmin" ||
    lower === "admin" || lower === "school_admin" || lower === "schooladmin"
  );
}

// Check if user has super admin role
export function isSuperAdminRole(roleName: string): boolean {
  const lower = (roleName || "").trim().toLowerCase();
  return lower === "super admin" || lower === "super_admin" || lower === "superadmin";
}

// Sign up function for user registration
export async function signUp(
  name: string,
  email: string,
  password: string,
  roleId?: string
): Promise<LoginResponse> {

  const requestBody = {
    name: name,
    email: email,
    password: password,
    // roleId: roleId || "default-role-id", // You may need to get a default role ID
  };

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/authapi/signup`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    // Try to parse error as JSON for better error messages
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.errors) {
        const errorMessages = Object.values(errorJson.errors).flat();
        throw new Error(`Signup failed: ${errorMessages.join(", ")}`);
      }
    } catch (parseError) {
      // If JSON parsing fails, use the raw error text
    }

    throw new Error(`Signup failed: ${errorText}`);
  }

  const result = await response.json();

  // Handle your API response format where token is inside 'data'
  if (result.data && result.data.token) {
    return {
      token: result.data.token,
      user: {
        id: result.data.user.id,
        name: result.data.user.name,
        email: result.data.user.email,
        roleId: result.data.user.roleId,
        role: {
          id: result.data.user.roleId,
          name: result.data.user.roleName,
          description: `${result.data.user.roleName} role`,
          isActive: true,
        },
      },
    };
  }

  // Fallback for direct token format
  return result;
}
