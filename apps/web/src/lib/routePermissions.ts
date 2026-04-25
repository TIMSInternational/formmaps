import { Roles, type RoleName } from "./permissions";
import { roleHomeMap } from "./roleUtils";

export interface RouteRule {
  /** Path prefix to match (e.g. "/dashboard/admin") */
  path: string;
  /** Roles allowed to access this path */
  allowed: RoleName[];
  /** Where to redirect if denied — "home" sends to the user's role home page */
  redirect: string | "home";
}

/**
 * Route rules ordered from most-specific to least-specific.
 * The first matching rule wins.
 */
export const routeRules: RouteRule[] = [
  // Super Admin panel — only super admins
  {
    path: "/dashboard/admin",
    allowed: [Roles.SUPER_ADMIN],
    redirect: "home",
  },
  // Coaching portal — only coaches
  {
    path: "/dashboard/coaching",
    allowed: [Roles.COACH],
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
  // Subscribe page — students only
  {
    path: "/subscribe",
    allowed: [Roles.STUDENT],
    redirect: "home",
  },
  // Student dashboard (catch-all for /dashboard/*) — students only
  // Super admin, school admin, counselor, coach, parent all have their own portals
  {
    path: "/dashboard",
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
    return roleHomeMap[role] || "/dashboard";
  }
  return rule.redirect;
}
