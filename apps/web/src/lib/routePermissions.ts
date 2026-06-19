import { Roles, type RoleName } from "./permissions";
import { roleHomeMap } from "./roleUtils";

export interface RouteRule {
  /** Path prefix to match (e.g. "/admin") */
  path: string;
  /** Roles allowed to access this path */
  allowed: RoleName[];
  /** Where to redirect if denied — "home" sends to the user's role home page */
  redirect: string | "home";
}

/**
 * Route rules ordered from most-specific to least-specific.
 * The first matching rule wins.
 *
 * RBAC: Each portal is strictly locked to its role(s).
 * No role can access another role's portal.
 */
export const routeRules: RouteRule[] = [
  // Super Admin panel
  {
    path: "/admin",
    allowed: [Roles.SUPER_ADMIN],
    redirect: "home",
  },
  // Coaching portal (must be before /dashboard)
  {
    path: "/dashboard/coaching",
    allowed: [Roles.COACH, Roles.SUPER_ADMIN],
    redirect: "home",
  },
  // Student dashboard — students only (coaches have /dashboard/coaching above)
  {
    path: "/dashboard",
    allowed: [Roles.STUDENT, Roles.COACH],
    redirect: "home",
  },
  // School admin portal
  {
    path: "/school-admin",
    allowed: [Roles.SUPER_ADMIN, Roles.SCHOOL_ADMIN],
    redirect: "home",
  },
  // Counselor portal
  {
    path: "/counselor",
    allowed: [Roles.SUPER_ADMIN, Roles.COUNSELOR],
    redirect: "home",
  },
  // Parent portal
  {
    path: "/parent",
    allowed: [Roles.SUPER_ADMIN, Roles.PARENT],
    redirect: "home",
  },
  // Teacher portal
  {
    path: "/teacher",
    allowed: [Roles.SUPER_ADMIN, Roles.TEACHER],
    redirect: "home",
  },
  // Subscribe page — students only
  {
    path: "/subscribe",
    allowed: [Roles.STUDENT],
    redirect: "home",
  },
];

/**
 * Find the first route rule that matches the given pathname.
 * Returns null if no rule matches (path is unprotected).
 */
export function findRouteRule(pathname: string): RouteRule | null {
  return routeRules.find((rule) => pathname.startsWith(rule.path)) ?? null;
}

/**
 * Resolve the redirect target for a denied route rule.
 * "home" resolves to the user's role-specific home page.
 */
export function resolveRedirect(rule: RouteRule, role: RoleName): string {
  if (rule.redirect === "home") {
    return roleHomeMap[role] || "/login";
  }
  return rule.redirect;
}

/**
 * Resolve where login should land the user, honoring a ?redirect= deep link
 * when it is safe (relative, inside a known portal) and the user's role may
 * access it. Falls back to the role's home page otherwise.
 */
export function resolveLoginRedirect(redirectParam: string | null, role: RoleName): string {
  const roleHome = roleHomeMap[role] || "/login";
  if (!redirectParam) return roleHome;
  if (!redirectParam.startsWith("/") || redirectParam.startsWith("//")) return roleHome;

  const pathname = redirectParam.split(/[?#]/)[0];
  const rule = findRouteRule(pathname);
  if (!rule) return roleHome; // outside known portals
  if (!rule.allowed.includes(role)) return roleHome;
  return redirectParam;
}
