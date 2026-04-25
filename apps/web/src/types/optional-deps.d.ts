// Type declarations for optional dependencies

// Allow side-effect CSS imports (e.g. import "./globals.css")
declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}

// web-vitals is an optional dependency for Core Web Vitals tracking
// Install with: npm install web-vitals
declare module "web-vitals" {
  interface Metric {
    name: string;
    value: number;
    id: string;
    delta: number;
    rating: "good" | "needs-improvement" | "poor";
  }

  type ReportCallback = (metric: Metric) => void;

  export function onCLS(callback: ReportCallback): void;
  export function onFID(callback: ReportCallback): void;
  export function onFCP(callback: ReportCallback): void;
  export function onLCP(callback: ReportCallback): void;
  export function onTTFB(callback: ReportCallback): void;
  export function onINP(callback: ReportCallback): void;
}
