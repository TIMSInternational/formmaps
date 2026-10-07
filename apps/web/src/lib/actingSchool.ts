/**
 * Super Admin "act as a school".
 *
 * A Super Admin belongs to no school, so every school-admin screen used to show "No school" errors or empty
 * lists. Opening a school (from /admin/schools, or the picker inside /school-admin) stores it here, and the
 * API client sends it as X-Acting-School-Id on school-admin pages. Both backends honour the header ONLY for a
 * Super Admin (formmaps-platform api/src/lib/actingSchool.ts, services/api ActingSchool.cs).
 *
 * Kept in sessionStorage, so it belongs to ONE browser tab: two schools open in two tabs can never write into
 * each other, and closing the tab forgets it.
 */
export const ACTING_SCHOOL_HEADER = "X-Acting-School-Id";

const STORAGE_KEY = "formmaps.actingSchool";

export interface ActingSchool {
  id: string;
  name: string;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // blocked storage (privacy mode): the picker simply shows again
  }
}

export function getActingSchool(): ActingSchool | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActingSchool>;
    return typeof parsed?.id === "string" && parsed.id
      ? { id: parsed.id, name: typeof parsed.name === "string" ? parsed.name : "" }
      : null;
  } catch {
    return null;
  }
}

export function setActingSchool(school: ActingSchool): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify({ id: school.id, name: school.name }));
  } catch {
    /* storage unavailable */
  }
}

export function clearActingSchool(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** School-admin pages are the only place a Super Admin acts as a school; /admin stays platform-wide. */
export function isSchoolAdminPath(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname === "/school-admin" || pathname.startsWith("/school-admin/"));
}

/**
 * The header value for a request made from `pathname`, or undefined. Sent only by a Super Admin, only from
 * school-admin pages; the backends ignore it for every other role anyway.
 */
export function actingSchoolHeaderFor(pathname: string | null | undefined, isSuperAdmin: boolean): string | undefined {
  if (!isSuperAdmin || !isSchoolAdminPath(pathname)) return undefined;
  return getActingSchool()?.id;
}

/**
 * Enter (or switch to) a school. A full page load, not a client-side navigation: every cached query belongs to
 * the previous school (or to none), and a reload is the one way to guarantee none of it is shown under the new one.
 */
export function openSchool(school: ActingSchool, path = "/school-admin"): void {
  setActingSchool(school);
  window.location.assign(path);
}

/** Leave the school and go back to the platform admin. */
export function leaveSchool(path = "/admin"): void {
  clearActingSchool();
  window.location.assign(path);
}
