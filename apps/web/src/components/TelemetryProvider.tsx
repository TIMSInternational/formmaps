"use client";

import { useEffect } from "react";
import { CookieConsentBanner } from "@/components/ui/CookieConsentBanner";
import { SessionTimeoutModal } from "@/components/auth/SessionTimeoutModal";
import { useConsent, hasAnalyticsConsent } from "@/hooks/useConsent";
import { useWebVitals } from "@/hooks/useWebVitals";
import { telemetry } from "@/services/telemetryService";
import { getUserSettings } from "@/services/userService";
import { useGlobalStore } from "@/store/useGlobalStore";

/**
 * TelemetryProvider wraps the app to:
 * 1. Show cookie consent banner if needed
 * 2. Enable/disable telemetry based on consent
 * 3. Track Core Web Vitals performance metrics (only if consented)
 * 4. Show session timeout warning modal
 * 
 * IMPORTANT: This is the only place where telemetry.init() should be called.
 */
export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const { hasAnalytics, isLoading } = useConsent();
  const userId = useGlobalStore((s) => s.user.id);
  const isAuthenticated = useGlobalStore((s) => s.user.isAuthenticated);

  // The account's own "Usage Analytics" setting is the second gate (#401). It is opt-in:
  // collection stays off unless the saved setting is explicitly true — no row, a failed
  // request or a signed-out visitor all mean off.
  useEffect(() => {
    telemetry.setAccountAnalytics(false);
    if (!isAuthenticated) return;
    let cancelled = false;
    getUserSettings()
      .then((settings) => {
        if (!cancelled) telemetry.setAccountAnalytics(settings?.allowAnalytics === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId]);

  // Track Web Vitals only if analytics consent is given
  // Note: useWebVitals internally checks before sending
  useWebVitals();

  // Initialize or stop telemetry based on consent
  useEffect(() => {
    if (isLoading) return;

    if (hasAnalytics) {
      // User has consented to analytics, initialize telemetry
      telemetry.init();
    } else {
      // No consent or consent revoked - stop telemetry
      telemetry.stop();
      telemetry.clearQueue();
    }
  }, [hasAnalytics, isLoading]);

  // Listen for consent granted events (when user clicks Accept)
  useEffect(() => {
    const handleConsentGranted = () => {
      if (hasAnalyticsConsent()) {
        telemetry.init();
      }
    };

    window.addEventListener("consentGranted", handleConsentGranted);
    return () => {
      window.removeEventListener("consentGranted", handleConsentGranted);
    };
  }, []);

  return (
    <>
      {children}
      <CookieConsentBanner />
      <SessionTimeoutModal />
    </>
  );
}

