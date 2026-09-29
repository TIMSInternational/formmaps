import type { TFunction } from "i18next";

/**
 * A recommendation request's `relationship` is free text the student typed
 * ("Math teacher", "Counselor"…) and is shown as-is — except when it is a bare
 * role code such as "teacher" or "school_admin", which is a data value, not
 * copy: show the translated role name for those.
 */
export function relationshipLabel(relationship: string, t: TFunction): string {
  const code = relationship.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return t(`common:admin.users.roleNames.${code}`, { defaultValue: "" }) || relationship;
}
