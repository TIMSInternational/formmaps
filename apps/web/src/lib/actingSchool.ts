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

type Navigate = (path: string) => void;
const hardNavigate: Navigate = (path) => window.location.assign(path);

/**
 * Enter (or switch to) a school. A full page load, not a client-side navigation: every cached query belongs to
 * the previous school (or to none), and a reload is the one way to guarantee none of it is shown under the new one.
 */
export function openSchool(school: ActingSchool, path = "/school-admin", navigate: Navigate = hardNavigate): void {
  setActingSchool(school);
  navigate(path);
}

/** Leave the school and go back to the platform admin. */
export function leaveSchool(path = "/admin", navigate: Navigate = hardNavigate): void {
  clearActingSchool();
  navigate(path);
}

/** A page about ONE student: /school-admin/users/{id} (and its old alias /school-admin/students/{id}). */
export function isStudentDetailPath(pathname: string | null | undefined): boolean {
  return !!pathname && /^\/school-admin\/(users|students)\/[^/]+\/?$/.test(pathname);
}

/**
 * Open one student's profile and results from Admin → Users. A student in a school opens INSIDE that school, so every
 * tab and link on the page behaves as for its school admin. An independent student has no school to enter: the page
 * opens with none, and the backends scope it to the student (school-only sections say so).
 */
export function openStudent(studentId: string, school: ActingSchool | null, navigate: Navigate = hardNavigate): void {
  const path = `/school-admin/users/${encodeURIComponent(studentId)}`;
  if (school) {
    openSchool(school, path, navigate);
  } else {
    clearActingSchool();
    navigate(path);
  }
}
