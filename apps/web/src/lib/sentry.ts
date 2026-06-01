// Sentry error tracking initialization
// To activate: set NEXT_PUBLIC_SENTRY_DSN environment variable

import * as Sentry from "@sentry/nextjs";

export function initSentry() {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  console.error(error);
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    if (context) Sentry.setContext("extra", context);
    Sentry.captureException(error);
  }
}
