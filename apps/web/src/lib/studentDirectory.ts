/**
 * The students list's filters live in the URL, so:
 *   - Back from a student returns to the same search / filters / page;
 *   - the student page asks the API for previous / next in that SAME list (same filters, same order).
 * The list URL and the student URL carry the same keys; the student URL adds `tab`.
 */

export const DIRECTORY_KEYS = ["lia", "personality", "eval360", "vocational360", "mil", "pca", "integrated"] as const;
export type DirectoryKey = (typeof DIRECTORY_KEYS)[number];
export type DirectoryState = "not_started" | "in_progress" | "completed";
export type DirectorySort = "name" | "grade" | "progress";

export interface DirectoryQuery {
  search: string;
  grade: string;
  assessment: DirectoryKey | "";
  state: DirectoryState | "";
  sort: DirectorySort;
  dir: "asc" | "desc";
  page: number;
}

export const DEFAULT_DIRECTORY_QUERY: DirectoryQuery = {
  search: "", grade: "", assessment: "", state: "", sort: "name", dir: "asc", page: 1,
};

const STATES: DirectoryState[] = ["not_started", "in_progress", "completed"];

type ParamsLike = { get(name: string): string | null } | null | undefined;

export function readDirectoryQuery(params: ParamsLike): DirectoryQuery {
  const get = (k: string) => params?.get(k)?.trim() ?? "";
  const assessment = get("assessment");
  const state = get("state");
  const sort = get("sort");
  const grade = get("grade");
  const page = Number.parseInt(get("page"), 10);
  return {
    search: get("search").slice(0, 100),
    grade: /^\d{1,2}$/.test(grade) ? grade : "",
    assessment: (DIRECTORY_KEYS as readonly string[]).includes(assessment) ? (assessment as DirectoryKey) : "",
    state: (STATES as string[]).includes(state) ? (state as DirectoryState) : "",
    sort: sort === "grade" || sort === "progress" ? sort : "name",
    dir: get("dir") === "desc" ? "desc" : "asc",
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** Only the values that differ from the defaults, in a stable order (clean, shareable URLs). */
export function directoryParams(q: DirectoryQuery, { withPage = true } = {}): URLSearchParams {
  const p = new URLSearchParams();
  if (q.search) p.set("search", q.search);
  if (q.grade) p.set("grade", q.grade);
  if (q.assessment) p.set("assessment", q.assessment);
  if (q.state) p.set("state", q.state);
  if (q.sort !== "name") p.set("sort", q.sort);
  if (q.dir !== "asc") p.set("dir", q.dir);
  if (withPage && q.page > 1) p.set("page", String(q.page));
  return p;
}

const withQuery = (path: string, p: URLSearchParams) => {
  const s = p.toString();
  return s ? `${path}?${s}` : path;
};

export const STUDENTS_PATH = "/school-admin/students";

export function studentsListHref(q: DirectoryQuery): string {
  return withQuery(STUDENTS_PATH, directoryParams(q));
}

/** A student's page, keeping the list it was opened from (for Back and previous / next). */
export function studentHref(id: string, q: DirectoryQuery, tab = "record"): string {
  const p = directoryParams(q);
  p.set("tab", tab);
  return withQuery(`/school-admin/users/${encodeURIComponent(id)}`, p);
}

/** True when any filter narrows the list (used for "Clear filters"). */
export function isFiltered(q: DirectoryQuery): boolean {
  return !!(q.search || q.grade || q.assessment || q.state);
}
