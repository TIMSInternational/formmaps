// Sentry error tracking initialization
// To activate: npm install @sentry/nextjs && set NEXT_PUBLIC_SENTRY_DSN

const SENTRY_MODULE = "@sentry/nextjs";

async function loadSentry(): Promise<any | null> {
  try {
    // Dynamic import — module may not be installed
    return await (new Function('m', 'return import(m)')(SENTRY_MODULE));
  } catch {
    return null;
  }
}

export function initSentry() {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  loadSentry().then((Sentry) => {
    if (!Sentry) return;
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
    });
  });
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  console.error(error);
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    loadSentry().then((Sentry) => {
      if (!Sentry) return;
      if (context) Sentry.setContext("extra", context);
      Sentry.captureException(error);
    });
  }
}
