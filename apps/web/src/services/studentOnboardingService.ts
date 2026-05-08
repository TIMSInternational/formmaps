import { apiRequest } from "@/lib/api/apiClient";
import { LoginResponse } from "./authService";

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

/**
 * Verify if the onboarding token is valid and get student details
 * Public endpoint — no auth needed, so we use raw fetch to avoid sending a JWT.
 */
export async function verifyStudentToken(token: string): Promise<VerifyTokenResponse> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    const response = await fetch(
      `${baseUrl}/api/v1/student/onboarding/verify/${token}`
    );

    if (!response.ok) {
      // Allow 404/400 to just return isValid: false instead of throwing
      return { isValid: false, message: "Invalid or expired token" };
    }

    const result = await response.json();

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

    return mappedResponse;
  } catch (error) {
    return { isValid: false, message: "Network error verifying token" };
  }
}

/**
 * Complete onboarding by setting password
 * Public endpoint — no auth needed, so we use raw fetch to avoid sending a JWT.
 */
export async function completeStudentOnboarding(
  token: string,
  password: string,
  confirmPassword: string,
  userId: string
): Promise<CompleteOnboardingResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const response = await fetch(
    `${baseUrl}/api/v1/student/onboarding/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
