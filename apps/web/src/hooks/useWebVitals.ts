"use client";

import { useEffect, useRef } from "react";
import { telemetry } from "@/services/telemetryService";

/**
 * Core Web Vitals metrics
 * These are Google's key performance metrics for user experience
 */
export interface WebVitals {
  // Largest Contentful Paint - loading performance
  lcp?: number;
  // First Input Delay - interactivity
  fid?: number;
  // Cumulative Layout Shift - visual stability
  cls?: number;
  // First Contentful Paint
  fcp?: number;
  // Time to First Byte
  ttfb?: number;
  // Interaction to Next Paint (replaces FID in 2024)
  inp?: number;
}

/**
 * Hook to measure and track Core Web Vitals
 * Automatically reports metrics to telemetry when available
 */
export function useWebVitals() {
  const reportedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Dynamically import web-vitals (optional dependency)
    // Install with: npm install web-vitals
    import("web-vitals")
      .then((webVitals) => {
        const { onCLS, onFID, onFCP, onLCP, onTTFB, onINP } = webVitals;
        
        const reportMetric = (metric: { name: string; value: number; id: string }) => {
          // Only report each metric once per page load
          if (reportedRef.current.has(metric.name)) return;
          reportedRef.current.add(metric.name);

          // Track as a special performance event
          telemetry.track("page_view", {
            type: "web_vital",
            metric: metric.name,
            value: metric.value,
            id: metric.id,
            page: window.location.pathname,
          });

          // Log in development
          if (process.env.NODE_ENV === "development") {
            console.debug(`[Web Vital] ${metric.name}: ${metric.value.toFixed(2)}`);
          }
        };

        // Register observers
        onCLS(reportMetric);
        onFID(reportMetric);
        onFCP(reportMetric);
        onLCP(reportMetric);
        onTTFB(reportMetric);
        if (onINP) onINP(reportMetric); // INP is newer, might not be available
      })
      .catch(() => {
        // web-vitals not installed, silently skip
        // To enable: npm install web-vitals
      });
  }, []);
}

/**
 * Get rating for a Web Vital metric
 * Based on Google's thresholds
 */
export function getVitalRating(
  metric: "LCP" | "FID" | "CLS" | "FCP" | "TTFB" | "INP",
  value: number
): "good" | "needs-improvement" | "poor" {
  const thresholds = {
    LCP: { good: 2500, poor: 4000 },
    FID: { good: 100, poor: 300 },
    CLS: { good: 0.1, poor: 0.25 },
    FCP: { good: 1800, poor: 3000 },
    TTFB: { good: 800, poor: 1800 },
    INP: { good: 200, poor: 500 },
  };

  const t = thresholds[metric];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}
