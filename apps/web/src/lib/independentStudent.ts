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
 * Where AuthWrapper sends a student with no entitlement. Flag OFF keeps
 * today's behaviour (/subscribe); flag ON sends them to the locked screen.
 */
export function unentitledStudentRedirect(paywallEnabled: boolean): string {
  return paywallEnabled ? COMPLETE_PURCHASE_ROUTE : "/subscribe";
}

/**
 * Student areas outside /dashboard that the paywall must also cover when ON
 * (flag OFF: AuthWrapper only checks its protectedRoutes, as today).
 */
export const PAYWALLED_STUDENT_AREAS = ["/careers", "/messages", "/print"] as const;
