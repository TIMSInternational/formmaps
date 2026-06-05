/**
 * Token Utility Service
 *
 * Handles JWT token validation, expiry checking, and centralized auth state management.
 */

import { clearTokens } from "@/services/tokenRefreshService";
import { hardNavigate } from "@/utils/navigation";

/**
 * Decode JWT token payload (client-side only)
 */
export function decodeToken(token: string): { exp?: number; iat?: number; [key: string]: unknown } | null {
  try {
    if (!token) {
      return null;
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const paddedPayload = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(paddedPayload.replace(/-/g, "+").replace(/_/g, "/"));

    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired
 * @param token - JWT token string
 * @param bufferSeconds - Time buffer before actual expiry (default 60 seconds)
 * @returns true if expired, false if valid, null if can't determine
 */
export function isTokenExpired(token: string | null, bufferSeconds = 60): boolean | null {
  if (!token) return true;
  
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    // Can't determine expiry from token
    return null;
  }

  // exp is in seconds, Date.now() is in milliseconds
  const expiryTime = decoded.exp * 1000;
  const bufferMs = bufferSeconds * 1000;
  
  return Date.now() >= expiryTime - bufferMs;
}

/**
 * Get time remaining until token expires
 * @returns milliseconds until expiry, or null if can't determine
 */
export function getTokenTimeRemaining(token: string | null): number | null {
  if (!token) return null;
  
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return null;

  const expiryTime = decoded.exp * 1000;
  return expiryTime - Date.now();
}

/**
 * Get stored token — returns null. Auth is handled via httpOnly cookies.
 */
export function getStoredToken(): string | null {
  return null;
}

/**
 * Clear auth state and redirect to login.
 * Performs a FULL session teardown: resets the persisted auth store (otherwise
 * AuthWrapper sees the stale persisted user and bounces /login back into the
 * portal, causing an infinite reload loop), clears the logged_in cookie, then
 * hard-navigates to /login.
 */
export function forceLogout(message?: string): void {
  if (typeof window === "undefined") return;

  // Show message if provided
  if (message) {
    // Store message to show on login page
    sessionStorage.setItem("auth_message", message);
  }

  // Lazy require to keep the store out of any server-side import graph
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGlobalStore } = require("@/store/useGlobalStore");
  useGlobalStore.getState().logout();
  clearTokens();

  hardNavigate("/login");
}

/**
 * Handle 401 response - clear auth and redirect
 */
export function handle401Response(): void {
  forceLogout("Your session has expired. Please log in again.");
}

/**
 * Create a fetch wrapper that handles 401 responses
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Add default Content-Type if not set
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers, credentials: "include" });

  // Handle 401 - token rejected by server
  if (response.status === 401) {
    handle401Response();
    throw new Error("Unauthorized");
  }

  return response;
}
