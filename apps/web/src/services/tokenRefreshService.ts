/**
 * Token Refresh Service
 *
 * Primary auth: httpOnly cookies (set by backend, immune to XSS)
 * Fallback: localStorage (for backward compat during migration)
 *
 * The backend sets httpOnly cookies on login/refresh automatically.
 * The frontend only needs to call the refresh endpoint — cookies are sent by the browser.
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
 * Store tokens in localStorage (fallback for non-cookie flows)
 * httpOnly cookies are set by the backend automatically on login/refresh
 */
export function storeTokens(tokens: TokenPair): void {
  if (typeof window === "undefined") return;
  // Keep localStorage as fallback for direct fetch() calls that don't use withCredentials
  localStorage.setItem("token", tokens.accessToken);
  localStorage.setItem("refreshToken", tokens.refreshToken);
  const expiryTime = Date.now() + tokens.expiresIn * 1000;
  localStorage.setItem("tokenExpiry", expiryTime.toString());
}

/**
 * Get stored refresh token (fallback — primary is httpOnly cookie)
 */
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refreshToken");
}

/**
 * Check if user is logged in (reads non-httpOnly logged_in cookie or localStorage)
 */
export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  // Check logged_in cookie (set by backend)
  if (document.cookie.includes("logged_in=true")) return true;
  // Fallback to localStorage
  return !!localStorage.getItem("token");
}

/**
 * Clear all tokens (on logout or refresh failure)
 */
export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("tokenExpiry");
  // Clear non-httpOnly cookie (httpOnly cookies cleared by backend on logout)
  document.cookie = "logged_in=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}

/**
 * Refresh the access token
 * Browser sends httpOnly refresh_token cookie automatically.
 * Also sends body refreshToken as fallback for older sessions.
 */
export async function refreshAccessToken(): Promise<TokenPair | null> {
  const refreshToken = getRefreshToken();

  try {
    const response = await fetch(`${API_BASE}/authapi/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // Send httpOnly cookies
      body: JSON.stringify({ refreshToken: refreshToken || "" }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearTokens();
      }
      return null;
    }

    const result: RefreshResponse = await response.json();

    if (result.success && result.data) {
      // Store in localStorage as fallback (cookies already set by backend)
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
 */
export function shouldRefreshToken(bufferMinutes = 5): boolean {
  if (typeof window === "undefined") return false;
  if (!isLoggedIn()) return false;

  const expiryStr = localStorage.getItem("tokenExpiry");
  if (!expiryStr) return false;

  const expiryTime = parseInt(expiryStr, 10);
  const bufferMs = bufferMinutes * 60 * 1000;

  return Date.now() >= expiryTime - bufferMs;
}

/**
 * Attempt to refresh token if needed
 */
export async function ensureValidToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const currentToken = localStorage.getItem("token");

  if (shouldRefreshToken()) {
    const newTokens = await refreshAccessToken();
    if (newTokens) {
      return newTokens.accessToken;
    }
    return currentToken;
  }

  return currentToken;
}
