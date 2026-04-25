"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { telemetry } from "@/services/telemetryService";
import { hasAnalyticsConsent } from "@/hooks/useConsent";

/**
 * Hook to automatically track page views on route changes.
 * GDPR-compliant: Only tracks if user has given analytics consent.
 * 
 * Usage: Call this hook in your root layout component.
 * 
 * @example
 * function DashboardLayout({ children }) {
 *   usePageViewTracking();
 *   return <>{children}</>;
 * }
 */
export function usePageViewTracking() {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    // Only track if the path actually changed
    if (pathname && pathname !== previousPathRef.current) {
      // GDPR: Check consent before tracking
      if (hasAnalyticsConsent()) {
        telemetry.trackPageView(pathname, previousPathRef.current || undefined);
      }
      previousPathRef.current = pathname;
    }
  }, [pathname]);
}
