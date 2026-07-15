"use client";

import { useMemo, useCallback } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Roles, type RoleName } from "@/lib/permissions";
import { normalizeRole } from "@/lib/roleUtils";
import { getRolePermissions } from "@/lib/rolePermissionMap";

export function usePermission() {
  const { user } = useGlobalStore();

  const role = useMemo<RoleName>(
    () => normalizeRole(user.role),
    [user.role]
  );

  // Use stored permissions from JWT/API, or fall back to client-side role map
  const permissions = useMemo<Set<string>>(() => {
    if (user.permissions && user.permissions.length > 0) {
      return new Set(user.permissions);
    }
    return new Set(getRolePermissions(role));
  }, [user.permissions, role]);

  const hasPermission = useCallback(
    (...perms: string[]) => perms.every((p) => permissions.has(p)),
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (...perms: string[]) => perms.some((p) => permissions.has(p)),
    [permissions]
  );

  return {
    role,
    permissions,
    hasPermission,
    hasAnyPermission,
    isSuperAdmin: role === Roles.SUPER_ADMIN,
    isSchoolAdmin: role === Roles.SCHOOL_ADMIN,
    isCounselor: role === Roles.COUNSELOR,
    isTeacher: role === Roles.TEACHER,
    isStudent: role === Roles.STUDENT,
    isCoach: role === Roles.COACH,
    isParent: role === Roles.PARENT,
    hasRole: (...roles: RoleName[]) => roles.includes(role),
  };
}
