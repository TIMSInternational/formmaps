"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import { refreshAccessToken } from "@/services/tokenRefreshService";
import { forceLogout } from "@/utils/tokenUtils";
import { useTranslation } from "react-i18next";

/**
 * Session Timeout Warning Modal
 * 
 * Displays when token is about to expire, giving user option to:
 * 1. Stay signed in (refresh token)
 * 2. Sign out immediately
 */
export function SessionTimeoutModal() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [minutesRemaining, setMinutesRemaining] = useState(5);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Listen for token expiry warning events from useTokenMonitor
  useEffect(() => {
    const handleWarning = (event: CustomEvent<{ minutesRemaining: number }>) => {
      setMinutesRemaining(event.detail.minutesRemaining);
      setIsOpen(true);
    };

    window.addEventListener("tokenExpiryWarning", handleWarning as EventListener);
    
    return () => {
      window.removeEventListener("tokenExpiryWarning", handleWarning as EventListener);
    };
  }, []);

  const handleStaySignedIn = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshAccessToken();
      if (result) {
        setIsOpen(false);
      } else {
        // Refresh failed, force logout
        forceLogout("Could not refresh your session. Please log in again.");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleSignOut = useCallback(() => {
    setIsOpen(false);
    forceLogout();
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent 
        className="sm:max-w-md"
        aria-describedby="session-timeout-description"
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-amber-100 rounded-full">
              <Clock className="h-6 w-6 text-amber-600" aria-hidden="true" />
            </div>
            <DialogTitle className="text-xl">
              {t("auth.sessionTimeout.title", "Session Expiring")}
            </DialogTitle>
          </div>
          <DialogDescription id="session-timeout-description" className="text-base">
            {t("auth.sessionTimeout.message", {
              minutes: minutesRemaining,
              defaultValue: `Your session will expire in ${minutesRemaining} minute(s). Would you like to stay signed in?`
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          <Button
            variant="outline"
            onClick={handleSignOut}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t("auth.sessionTimeout.signOut", "Sign Out")}
          </Button>
          <Button
            onClick={handleStaySignedIn}
            disabled={isRefreshing}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700"
          >
            {isRefreshing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t("auth.sessionTimeout.refreshing", "Refreshing...")}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {t("auth.sessionTimeout.staySignedIn", "Stay Signed In")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
