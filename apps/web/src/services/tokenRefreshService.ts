/**
 * Token Refresh Service
 * 
 * Handles automatic token refresh before expiry.
 * Requires backend support for refresh token endpoint.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access token expires
}

export interface RefreshResponse {
  success: boolean;
  data?: TokenPair;
  message?: string;
}

/**
 * Store tokens securely
 * Access token in localStorage (for API calls)
 * Refresh token in httpOnly cookie (set by backend) or localStorage as fallback
 */
export function storeTokens(tokens: TokenPair): void {
  if (typeof window === "undefined") return;
  
  localStorage.setItem("token", tokens.accessToken);
  
  // Store refresh token (ideally this would be an httpOnly cookie set by the server)
  // For now we use localStorage as a fallback
  localStorage.setItem("refreshToken", tokens.refreshToken);
  
  // Store expiry time for monitoring
  const expiryTime = Date.now() + tokens.expiresIn * 1000;
  localStorage.setItem("tokenExpiry", expiryTime.toString());
}

/**
 * Get stored refresh token
 */
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refreshToken");
}

/**
 * Clear all tokens (on logout or refresh failure)
 */
export function clearTokens(): void {
  if (typeof window === "undefined") return;
  
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("tokenExpiry");
}

/**
 * Refresh the access token using the refresh token
 * 
 * @returns New token pair if successful, null if refresh failed
 */
export async function refreshAccessToken(): Promise<TokenPair | null> {
  const refreshToken = getRefreshToken();
  
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}/authapi/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      // Clear tokens if refresh fails (refresh token is also expired)
      if (response.status === 401 || response.status === 403) {
        clearTokens();
      }
      return null;
    }

    const result: RefreshResponse = await response.json();
    
    if (result.success && result.data) {
      storeTokens(result.data);
      return result.data;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if we should attempt a token refresh
 * Returns true if:
 * - We have a refresh token
 * - The access token will expire within the buffer time
 */
export function shouldRefreshToken(bufferMinutes = 5): boolean {
  if (typeof window === "undefined") return false;
  
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  
  const expiryStr = localStorage.getItem("tokenExpiry");
  if (!expiryStr) return false;
  
  const expiryTime = parseInt(expiryStr, 10);
  const bufferMs = bufferMinutes * 60 * 1000;
  
  return Date.now() >= expiryTime - bufferMs;
}

/**
 * Attempt to refresh token if needed
 * Call this before making API requests
 */
export async function ensureValidToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  
  const currentToken = localStorage.getItem("token");
  
  // Check if we should refresh
  if (shouldRefreshToken()) {
    const newTokens = await refreshAccessToken();
    if (newTokens) {
      return newTokens.accessToken;
    }
    // Refresh failed, return current token (might be expired)
    return currentToken;
  }
  
  return currentToken;
}
