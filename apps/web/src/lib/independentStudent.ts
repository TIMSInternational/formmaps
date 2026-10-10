import { Roles } from "./permissions";
import { normalizeRole } from "./roleUtils";

/**
 * Independent students = role student with NO school (formmaps-platform#399).
 *
 * Decision (Federico, 2026-10-06): they may only enter FormMaps by paying, and
 * the school-only features below are hidden from them regardless of any flag —
 * each one needs a school (grades entered by a school, a school's video plan,
 * a school counselor, school staff to write a letter), so for a self-serve
 * student they were dead ends (#399's table).
 */
export const SCHOOL_ONLY_ROUTES = [
  "/dashboard/transcript",
  "/dashboard/video",
  "/dashboard/book-counselor",
  "/dashboard/recommendations",
] as const;

export function isSchoolOnlyRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return SCHOOL_ONLY_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * True only when we KNOW the student has no school: `schoolId === null`.
 * `undefined` means "not loaded yet" (old persisted session before
 * useUserPermissions syncs it) — treated as NOT independent, so a school
 * student never sees their features flicker away.
 */
export function isIndependentStudentUser(user: { role?: string | null; schoolId?: string | null }): boolean {
  return normalizeRole(user.role) === Roles.STUDENT && user.schoolId === null;
}

/**
 * NEXT_PUBLIC_INDEPENDENT_STUDENT_PAYWALL — default OFF. Must be flipped
 * together with the API's INDEPENDENT_STUDENT_PAYWALL (see the spec's rollout).
 * Read at build time (NEXT_PUBLIC_*), so flipping it needs a redeploy.
 */
export function isStudentPaywallEnabled(value: string | undefined = process.env.NEXT_PUBLIC_INDEPENDENT_STUDENT_PAYWALL): boolean {
  const v = (value || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

/** Where a locked independent student is sent when the paywall is on. */
export const COMPLETE_PURCHASE_ROUTE = "/complete-purchase";

/**
 * audit 2026-10-09 C18: the `returnTo` the apiClient's 402 redirect appends to /complete-purchase, accepted only
 * as a same-origin app path (no `//host`, no scheme, not the purchase page itself — that would loop).
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw === COMPLETE_PURCHASE_ROUTE || raw.startsWith(`${COMPLETE_PURCHASE_ROUTE}?`) || raw.startsWith(`${COMPLETE_PURCHASE_ROUTE}/`)) return null;
  return raw;
}

/**
 * Student areas outside /dashboard that the paywall must also cover when ON
 * (flag OFF: AuthWrapper only checks its protectedRoutes, as today).
 */
export const PAYWALLED_STUDENT_AREAS = ["/careers", "/messages", "/print"] as const;

/** Taking assessments is open to every signed-up student (D4). */
export const ASSESSMENT_AREAS = ["/dashboard/assessments", "/evaluation"] as const;
/** Full results areas — open with paid results (one-time or charged subscription). */
export const RESULTS_AREAS = ["/dashboard/career-paths", "/print"] as const;

function inAreas(pathname: string, areas: readonly string[]): boolean {
  return areas.some((a) => pathname === a || pathname.startsWith(`${a}/`));
}

export interface StudentAccessStatus {
  hasActiveSubscription: boolean;
  hasFullPlatform?: boolean;
  hasPaidAccess?: boolean;
}

/**
 * Where AuthWrapper sends a student for this path, or null to stay.
 * Flag OFF: today's rule — no entitlement → /subscribe.
 * Flag ON (#429): the full platform needs a subscription (trial counts);
 * assessments are open to everyone; results areas open with paid results.
 * The API enforces the same split (402) — this is only navigation.
 */
export function studentAccessRedirect(
  pathname: string,
  status: StudentAccessStatus,
  paywallEnabled: boolean,
): string | null {
  if (!paywallEnabled) return status.hasActiveSubscription ? null : "/subscribe";
  const fullPlatform = status.hasFullPlatform ?? status.hasActiveSubscription;
  if (fullPlatform) return null;
  if (inAreas(pathname, ASSESSMENT_AREAS)) return null;
  if (status.hasPaidAccess && inAreas(pathname, RESULTS_AREAS)) return null;
  return COMPLETE_PURCHASE_ROUTE;
}
