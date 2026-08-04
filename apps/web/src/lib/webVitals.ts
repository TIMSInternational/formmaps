"use client";

/**
 * Core Web Vitals reporting — formmaps#90.
 *
 * `web-vitals` has been a dependency for a while but NOTHING imported it: the only
 * reference was a type shim in `src/types/optional-deps.d.ts`. So the app collected no
 * field performance data whatsoever, which is why "the frontend feels slow" could only
 * be argued from code reading. It also made #90 unassessable — 434 of 688 components
 * being client-rendered is suggestive, not evidence.
 *
 * Reports through the existing telemetry channel rather than adding a vendor: it
 * already batches, flushes on page hide, hashes the user id and expires rows after 90
 * days. Nothing new to operate, and no third party gets the data.
 *
 * KNOWN LIMITATION, stated rather than implied: /api/v1/telemetry/events requires
 * authentication, so vitals are only captured for signed-in users. Sign-in and
 * marketing pages — very plausibly the worst LCP in the app, since they are the cold
 * first load — are invisible here. Fixing that means an unauthenticated ingest path,
 * which is a rate-limiting and abuse decision, not a one-line change.
 */
import { telemetry } from "@/services/telemetryService";

type Vital = { name: string; value: number; rating: string; navigationType?: string };

let started = false;

/**
 * Subscribe to the Core Web Vitals. Idempotent — the callbacks would otherwise
 * double-report if a remount called this again, and CLS in particular reports
 * repeatedly as layout shifts accumulate.
 */
export function reportWebVitals(): void {
  if (typeof window === "undefined" || started) return;
  started = true;

  const send = (metric: Vital) => {
    telemetry.track("web_vital", {
      metric: metric.name,
      // LCP/INP/TTFB/FCP are milliseconds; CLS is a unitless ratio, so it needs the
      // extra precision. Rounding milliseconds keeps the stored properties small.
      value: metric.name === "CLS" ? Number(metric.value.toFixed(4)) : Math.round(metric.value),
      rating: metric.rating,
      navigationType: metric.navigationType,
      // Pathname only — deliberately NOT the full URL, which carries ids and query
      // strings for student-scoped routes. The route shape is what makes a slow page
      // identifiable; the identifiers add nothing but risk.
      path: window.location.pathname,
    });
  };

  // Imported dynamically so the library stays out of the initial bundle — measuring
  // performance should not itself cost first-load bytes. Failure is swallowed:
  // web-vitals is declared as an optional dependency, and losing telemetry must never
  // break the page.
  void import("web-vitals")
    .then(({ onCLS, onINP, onLCP, onTTFB, onFCP }) => {
      onCLS(send);
      onINP(send);
      onLCP(send);
      onTTFB(send);
      onFCP(send);
    })
    .catch(() => {
      /* web-vitals unavailable — no telemetry, no error surfaced to the user */
    });
}
