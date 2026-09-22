// Sentry error tracking initialization
// To activate: set NEXT_PUBLIC_SENTRY_DSN environment variable

import * as Sentry from "@sentry/nextjs";

/**
 * What this file is defending against.
 *
 * FormMaps URLs carry single-use secrets in the path and the query string: student onboarding
 * tokens, password-reset tokens, and the 360-evaluator links a parent or teacher clicks to rate a
 * named 16-year-old. Sentry's default browser integrations attach the full URL to every event and
 * to every navigation/fetch breadcrumb. With no `beforeSend`, one uncaught exception on an invite
 * page hands a third party a working credential for a minor's account, plus the record IDs to go
 * with it.
 *
 * The DSN is unset today, which is the only reason this has not already happened. It is one
 * environment variable away from being live, so the scrubbing belongs in the code, not in a note.
 */

/** 8-4-4-4-12 hex. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A path segment that is an identifier rather than a route name.
 *
 * Covers UUIDs, Prisma cuids (25 chars, `c...`), and the 32-64 char hex/base64url invitation and
 * reset tokens this app mints. The length floor is 20 because no route name in this app is that
 * long, and because being wrong in this direction costs a little debugging context while being
 * wrong in the other direction leaks a credential.
 */
function isIdentifierSegment(segment: string): boolean {
  if (UUID.test(segment)) return true;
  return segment.length >= 20 && /^[A-Za-z0-9_.-]+$/.test(segment);
}

/**
 * Drop the query string and fragment, redact identifier-shaped path segments, keep the shape.
 *
 * `/onboarding/student?token=abc` becomes `/onboarding/student?[redacted]` -- still obviously the
 * onboarding page, with nothing usable attached. Keeping the marker rather than deleting the query
 * outright matters when you are reading the report: "there was a query here" is the difference
 * between a bug you can place and one you cannot.
 */
export function scrubUrl(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;

  const [beforeFragment, fragment] = splitOnce(raw, "#");
  const [path, query] = splitOnce(beforeFragment, "?");

  const scrubbedPath = path
    .split("/")
    .map((segment) => (isIdentifierSegment(segment) ? "[redacted]" : segment))
    .join("/");

  return scrubbedPath + (query !== undefined ? "?[redacted]" : "") + (fragment !== undefined ? "#[redacted]" : "");
}

function splitOnce(value: string, separator: string): [string, string | undefined] {
  const at = value.indexOf(separator);
  return at === -1 ? [value, undefined] : [value.slice(0, at), value.slice(at + 1)];
}

/** Anything that looks like a URL, anywhere in a nested structure, gets scrubbed. */
function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (typeof value === "string") return /^https?:\/\/|^\//.test(value) ? scrubUrl(value) : value;
  if (Array.isArray(value)) return value.map((entry) => scrubDeep(entry, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = scrubDeep(entry, depth + 1);
    }
    return out;
  }
  return value;
}

/** Exported so it can be tested without a DSN or a network. */
export function scrubEvent<T extends Record<string, unknown>>(event: T): T {
  const request = event.request as { url?: string; query_string?: unknown; headers?: Record<string, string> } | undefined;
  if (request) {
    if (typeof request.url === "string") request.url = scrubUrl(request.url);
    delete request.query_string;
    if (request.headers) {
      for (const header of ["Referer", "referer", "Referrer", "referrer"]) {
        if (typeof request.headers[header] === "string") {
          request.headers[header] = scrubUrl(request.headers[header]);
        }
      }
    }
  }

  const breadcrumbs = event.breadcrumbs as Array<{ data?: Record<string, unknown>; message?: string }> | undefined;
  if (Array.isArray(breadcrumbs)) {
    for (const crumb of breadcrumbs) {
      if (crumb.data) crumb.data = scrubDeep(crumb.data) as Record<string, unknown>;
      // Navigation crumbs put the URL straight in the message.
      if (typeof crumb.message === "string") crumb.message = scrubUrl(crumb.message);
    }
  }

  // `event` is a type parameter, so TypeScript refuses a write through a dot access on it even
  // though the constraint carries an index signature. Write through the constraint: same object,
  // mutated in place, exactly as the request and breadcrumb passes above do.
  const mutable = event as Record<string, unknown>;
  if (mutable.extra) mutable.extra = scrubDeep(mutable.extra);
  if (mutable.contexts) mutable.contexts = scrubDeep(mutable.contexts);

  return event;
}

export function initSentry() {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    // 0, not 1.0. Session Replay records the DOM, and the DOM on an error here is a named minor's
    // psychometric results, class rank, essay drafts or a counselor's notes about them. There is no
    // sampling rate at which shipping that to a third party is a debugging trade-off worth making.
    replaysOnErrorSampleRate: 0,
    beforeSend: (event) => scrubEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
    beforeBreadcrumb: (crumb) => {
      if (crumb.data) crumb.data = scrubDeep(crumb.data) as typeof crumb.data;
      if (typeof crumb.message === "string") crumb.message = scrubUrl(crumb.message);
      return crumb;
    },
  });
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  console.error(error);
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    if (context) Sentry.setContext("extra", scrubDeep(context) as Record<string, unknown>);
    Sentry.captureException(error);
  }
}
