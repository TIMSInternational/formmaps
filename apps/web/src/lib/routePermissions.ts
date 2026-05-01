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
 */
export const routeRules: RouteRule[] = [
  // Super Admin panel — only super admins
  {
    path: "/admin",
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
  // Dashboard — allow all authenticated roles. Non-students see nothing
  // (page.tsx returns null). Specific sub-route rules above still enforce
  // access for /dashboard/coaching etc. This prevents redirect loops when
  // Next.js briefly renders /dashboard during client-side navigation.
  {
    path: "/dashboard",
    allowed: [Roles.STUDENT, Roles.SUPER_ADMIN, Roles.COACH, Roles.SCHOOL_ADMIN, Roles.COUNSELOR, Roles.PARENT],
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
