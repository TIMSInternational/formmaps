"use client";

import { useEffect, useRef, useCallback } from "react";
import { getStoredToken, getTokenTimeRemaining, forceLogout } from "@/utils/tokenUtils";
import { refreshAccessToken, shouldRefreshToken, clearTokens } from "@/services/tokenRefreshService";

/**
 * Hook to monitor token expiry in the background.
 * Automatically refreshes token when it's about to expire.
 * Falls back to logout if refresh fails.
 * 
 * @param warningMinutes - Show warning this many minutes before expiry (0 = no warning)
 */
export function useTokenMonitor(warningMinutes = 5) {
  const warningShownRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const attemptRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return false;
    
    isRefreshingRef.current = true;
    try {
      const newTokens = await refreshAccessToken();
      if (newTokens) {
        console.log("[TokenMonitor] Token refreshed successfully");
        warningShownRef.current = false; // Reset warning for next cycle
        return true;
      }
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkToken = async () => {
      const token = getStoredToken();
      if (!token) return;

      const timeRemaining = getTokenTimeRemaining(token);
      if (timeRemaining === null) return; // Can't determine expiry

      const warningMs = warningMinutes * 60 * 1000;
      const refreshBufferMs = 5 * 60 * 1000; // Refresh 5 mins before expiry

      // Token expired - try to refresh, otherwise logout
      if (timeRemaining <= 0) {
        console.log("[TokenMonitor] Token expired, attempting refresh");
        const refreshed = await attemptRefresh();
        if (!refreshed) {
          console.log("[TokenMonitor] Refresh failed, forcing logout");
          clearTokens();
          forceLogout("Your session has expired. Please log in again.");
        }
        return;
      }

      // Token about to expire - try to refresh proactively
      if (shouldRefreshToken(5) && !isRefreshingRef.current) {
        console.log("[TokenMonitor] Token expiring soon, refreshing proactively");
        await attemptRefresh();
        return;
      }

      // Show warning before expiry (only once per cycle)
      if (warningMinutes > 0 && timeRemaining <= warningMs && !warningShownRef.current) {
        warningShownRef.current = true;
        const minutesLeft = Math.ceil(timeRemaining / 60000);
        
        console.warn(`[TokenMonitor] Session expires in ${minutesLeft} minute(s)`);
        
        // Dispatch event for UI to handle (e.g., show modal)
        window.dispatchEvent(
          new CustomEvent("tokenExpiryWarning", { 
            detail: { minutesRemaining: minutesLeft } 
          })
        );
      }
    };

    // Check immediately on mount
    checkToken();

    // Check every 30 seconds
    checkIntervalRef.current = setInterval(checkToken, 30000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [warningMinutes, attemptRefresh]);
}
