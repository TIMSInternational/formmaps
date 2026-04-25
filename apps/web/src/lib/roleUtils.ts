import { Roles, type RoleName } from "./permissions";

/**
 * Normalize any raw role string to a canonical RoleName.
 * Handles legacy "staff" → Parent, case-insensitive matching, etc.
 */
export function normalizeRole(raw: string | null | undefined): RoleName {
  if (!raw) return Roles.STUDENT;

  const lower = raw.trim().toLowerCase();

  switch (lower) {
    case "super admin":
    case "super_admin":
    case "superadmin":
    case "admin":
      return Roles.SUPER_ADMIN;

    case "school_admin":
    case "schooladmin":
    case "school admin":
      return Roles.SCHOOL_ADMIN;

    case "counselor":
      return Roles.COUNSELOR;

    case "student":
    case "user":
      return Roles.STUDENT;

    case "coach":
      return Roles.COACH;

    case "parent":
    case "staff":
      return Roles.PARENT;

    default:
      return Roles.STUDENT;
  }
}

/** Map each role to its default home route after login */
export const roleHomeMap: Record<RoleName, string> = {
  [Roles.SUPER_ADMIN]: "/dashboard/admin",
  [Roles.SCHOOL_ADMIN]: "/school-admin",
  [Roles.COUNSELOR]: "/counselor",
  [Roles.STUDENT]: "/dashboard",
  [Roles.COACH]: "/dashboard/coaching",
  [Roles.PARENT]: "/parent",
};
