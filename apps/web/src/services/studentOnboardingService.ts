import { LoginResponse } from "./authService";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export interface VerifyTokenResponse {
  isValid: boolean | string;
  student?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  message?: string;
}

export interface CompleteOnboardingResponse extends LoginResponse {
  success: boolean;
  message?: string;
}

// Helper for headers
const getHeaders = () => {
  return {
    "Content-Type": "application/json",
  };
};

/**
 * Verify if the onboarding token is valid and get student details
 */
export async function verifyStudentToken(token: string): Promise<VerifyTokenResponse> {


  if (token === "invalid") {
    return { isValid: false, message: "Invalid or expired token" };
  }
  // END MOCK

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/student/onboarding/verify/${token}`,
      { headers: getHeaders() }
    );

    if (!response.ok) {
      // Allow 404/400 to just return isValid: false instead of throwing
      return { isValid: false, message: "Invalid or expired token" };
    }

    const result = await response.json();
    console.log("🔍 verifyStudentToken RAW API RESPONSE:", JSON.stringify(result, null, 2));

    // API returns { data: { isValid: boolean, ... }, success: boolean, ... }
    // We need to map it to VerifyTokenResponse interface

    const mappedResponse = {
      isValid: result.data?.isValid || false,
      student: result.data ? {
        id: result.data.userId || result.data.id, // Try both/either
        name: result.data.name,
        email: result.data.email
      } : undefined,
      message: result.message
    };

    console.log("🔍 verifyStudentToken MAPPED RESPONSE:", JSON.stringify(mappedResponse, null, 2));

    return mappedResponse;
  } catch (error) {
    console.warn("verifyStudentToken API failed", error);
    return { isValid: false, message: "Network error verifying token" };
  }
}

/**
 * Complete onboarding by setting password
 */
export async function completeStudentOnboarding(
  token: string,
  password: string,
  confirmPassword: string,
  userId: string
): Promise<CompleteOnboardingResponse> {
  // MOCK IMPLEMENTATION
  if (token.startsWith("test")) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
      success: true,
      token: "mock-jwt-token",
      user: {
        id: "student-123",
        name: "Alex Johnson",
        email: "alex.student@example.com",
        roleId: "student-role-id",
        role: {
          id: "student-role-id",
          name: "Student",
          description: "Student Role",
          isActive: true
        }
      }
    };
  }
  // END MOCK

  const response = await fetch(
    `${API_BASE_URL}/api/v1/student/onboarding/complete`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        Token: token,
        Password: password,
        ConfirmPassword: confirmPassword,
        UserId: userId
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to complete onboarding");
  }

  const result = await response.json();

  // Map API response to CompleteOnboardingResponse interface
  // Check if data is nested inside 'data' property
  if (result.data) {
    // If token exists, map user data for auto-login
    if (result.data.token) {
      return {
        success: result.success !== undefined ? result.success : true,
        message: result.message,
        token: result.data.token,
        user: {
          id: result.data.user.id,
          name: result.data.user.name,
          email: result.data.user.email,
          roleId: result.data.user.roleId,
          role: result.data.user.role ? {
            id: result.data.user.role.id,
            name: result.data.user.role.name,
            description: result.data.user.role.description,
            isActive: result.data.user.role.isActive
          } : undefined
        }
      };
    }

    // If no token (registration only), return success with limited user data if available
    return {
      success: result.success !== undefined ? result.success : true,
      message: result.data.message || result.message,
      token: "", // Empty string or undefined if interface allows
      user: {
        id: result.data.userId || "",
        name: result.data.name || "",
        email: result.data.email || "",
        roleId: "",
      }
    };
  }

  return result;
}
