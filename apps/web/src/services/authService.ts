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
      console.log("Skipping JWT decode for test token");
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
    console.warn(
      "Failed to decode JWT token (this is normal for test tokens):",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

// Test function to explore auth APIs and token content
export async function testAuthAPIs(): Promise<void> {
  try {
    console.log("🔍 Testing Auth APIs...");

    const token = localStorage.getItem("token");
    if (token) {
      console.log("📝 Current token:", token);

      // Try to decode the JWT token
      const decodedToken = decodeJWTToken(token);
      if (decodedToken) {
        console.log("🔓 Decoded JWT payload:", decodedToken);

        // Look for role information in the token
        if (decodedToken.role || decodedToken.roleId || decodedToken.roleName) {
          console.log("🎭 Role info in token:", {
            role: decodedToken.role,
            roleId: decodedToken.roleId,
            roleName: decodedToken.roleName,
          });
        }
      }
    }

    // Test get current user
    try {
      const currentUser = await getCurrentUser();
      console.log("✅ Current User:", currentUser);

      if (currentUser.roleId) {
        console.log("🎭 User Role ID:", currentUser.roleId);

        // Try to get role details
        try {
          const { getRoleById } = await import("./roleService");
          const roleDetails = await getRoleById(currentUser.roleId);
          console.log("✅ Role Details:", roleDetails);
        } catch (roleError) {
          console.log("❌ Failed to get role details:", roleError);
        }
      }
    } catch (error) {
      console.log("❌ Get Current User failed:", error);
    }

    // Test the test API endpoint
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/authapi/test`
      );
      if (response.ok) {
        const testResult = await response.text();
        console.log("✅ Auth Test API:", testResult);
      }
    } catch (error) {
      console.log("❌ Auth Test API failed:", error);
    }
  } catch (error) {
    console.error("Auth API testing failed:", error);
  }
}

// Login function for authentication
export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  console.log("🔐 Attempting login with:", { email, password: "***" });

  const requestBody = {
    email: email,
    password: password,
  };

  console.log("📤 Request body:", requestBody);
  console.log(
    "📤 API URL:",
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/authapi/login`
  );

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

  console.log("📥 Response status:", response.status);
  console.log(
    "📥 Response headers:",
    Object.fromEntries(response.headers.entries())
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Login error response:", errorText);

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
  console.log("✅ Login successful:", result);

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
  const adminRoleNames = [
    "admin",
    "Admin",
    "ADMIN",
    "super_admin",
    "Super_Admin",
    "Super Admin", // Added this for the JWT token format
    "SUPER_ADMIN",
    "SUPER ADMIN",
    "superadmin",
    "SuperAdmin",
    "SUPERADMIN",
    "administrator",
    "Administrator",
    "ADMINISTRATOR",
  ];

  return adminRoleNames.includes(roleName);
}

// Check if user has super admin role
export function isSuperAdminRole(roleName: string): boolean {
  const superAdminRoleNames = [
    "super_admin",
    "Super_Admin",
    "Super Admin", // This is what we get from the JWT
    "SUPER_ADMIN",
    "SUPER ADMIN",
    "superadmin",
    "SuperAdmin",
    "SUPERADMIN",
  ];

  return superAdminRoleNames.includes(roleName);
}

// Sign up function for user registration
export async function signUp(
  name: string,
  email: string,
  password: string,
  roleId?: string
): Promise<LoginResponse> {
  console.log("📝 Attempting signup with:", {
    name,
    email,
    password: "***",
    roleId,
  });

  const requestBody = {
    name: name,
    email: email,
    password: password,
    // roleId: roleId || "default-role-id", // You may need to get a default role ID
  };

  console.log("📤 Signup request body:", requestBody);
  console.log(
    "📤 API URL:",
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/authapi/signup`
  );

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

  console.log("📥 Signup response status:", response.status);
  console.log(
    "📥 Signup response headers:",
    Object.fromEntries(response.headers.entries())
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Signup error response:", errorText);

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
  console.log("✅ Signup successful:", result);

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
