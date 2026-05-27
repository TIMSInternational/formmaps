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
 * Store tokens — now a no-op. httpOnly cookies are set by the backend.
 * Kept as a function to avoid breaking call sites during migration.
 */
export function storeTokens(_tokens: TokenPair): void {
  // No-op: auth is handled entirely via httpOnly cookies
}

/**
 * Get stored refresh token — now returns null.
 * The refresh token is in an httpOnly cookie sent automatically by the browser.
 */
export function getRefreshToken(): string | null {
  return null;
}

/**
 * Check if user is logged in (reads non-httpOnly logged_in cookie)
 */
export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return document.cookie.includes("logged_in=true");
}

/**
 * Clear all tokens (on logout or refresh failure)
 */
export function clearTokens(): void {
  if (typeof window === "undefined") return;
  // Clear non-httpOnly cookie (httpOnly cookies cleared by backend on logout)
  document.cookie = "logged_in=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}

/**
 * Refresh the access token
 * Browser sends httpOnly refresh_token cookie automatically.
 * Also sends body refreshToken as fallback for older sessions.
 */
export async function refreshAccessToken(): Promise<TokenPair | null> {
  try {
    const response = await fetch(`${API_BASE}/authapi/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // Send httpOnly cookies
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearTokens();
      }
      return null;
    }

    const result: RefreshResponse = await response.json();

    if (result.success && result.data) {
      return result.data;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if we should attempt a token refresh.
 * Without localStorage expiry, we rely on the server returning 401 and
 * the response interceptor triggering a refresh. This function now only
 * checks if the user appears logged in.
 */
export function shouldRefreshToken(): boolean {
  return isLoggedIn();
}

/**
 * Attempt to refresh token if needed.
 * Returns null — callers should not depend on a token string.
 * Auth is handled via httpOnly cookies.
 */
export async function ensureValidToken(): Promise<string | null> {
  return null;
}
