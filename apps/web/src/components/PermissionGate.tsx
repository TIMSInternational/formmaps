"use client";

import { usePermission } from "@/hooks/usePermission";
import type { RoleName } from "@/lib/permissions";

interface PermissionGateProps {
  children: React.ReactNode;
  /** Required permission(s) — ALL must match */
  permission?: string | string[];
  /** Required role(s) — ANY must match */
  role?: RoleName | RoleName[];
  /** What to render when access is denied (defaults to nothing) */
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on the current user's permissions or role.
 *
 * Usage:
 *   <PermissionGate permission="admin:dashboard">
 *     <AdminPanel />
 *   </PermissionGate>
 *
 *   <PermissionGate role={[Roles.SUPER_ADMIN, Roles.SCHOOL_ADMIN]}>
 *     <SchoolSettings />
 *   </PermissionGate>
 */
export function PermissionGate({ children, permission, role, fallback = null }: PermissionGateProps) {
  const { hasPermission, hasRole } = usePermission();

  // Check permission(s) if specified
  if (permission) {
    const perms = Array.isArray(permission) ? permission : [permission];
    if (!hasPermission(...perms)) {
      return <>{fallback}</>;
    }
  }

  // Check role(s) if specified
  if (role) {
    const roles = Array.isArray(role) ? role : [role];
    if (!hasRole(...roles)) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}
