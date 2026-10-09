/**
 * The students list's filters ride in the URL (lib/studentDirectory.ts): Back returns to the same list and
 * previous / next walk the same list. Defaults stay out of the URL; junk values fall back to defaults.
 */
import {
  DEFAULT_DIRECTORY_QUERY, directoryParams, isFiltered, readDirectoryQuery, studentHref, studentsListHref,
} from "@/lib/studentDirectory";

const read = (qs: string) => readDirectoryQuery(new URLSearchParams(qs));

describe("readDirectoryQuery", () => {
  it("no params → defaults", () => {
    expect(read("")).toEqual(DEFAULT_DIRECTORY_QUERY);
    expect(readDirectoryQuery(null)).toEqual(DEFAULT_DIRECTORY_QUERY);
  });

  it("reads every filter", () => {
    expect(read("search=%20ana%20&grade=10&assessment=mil&state=not_started&sort=progress&dir=desc&page=3")).toEqual({
      search: "ana", grade: "10", assessment: "mil", state: "not_started", sort: "progress", dir: "desc", page: 3,
    });
  });

  it("junk falls back to defaults", () => {
    expect(read("grade=abc&assessment=careerfit&state=done&sort=evil&dir=up&page=-2")).toEqual(DEFAULT_DIRECTORY_QUERY);
    expect(read("page=1.9").page).toBe(1);
    expect(read(`search=${"x".repeat(300)}`).search).toHaveLength(100);
  });
});

describe("URLs", () => {
  const q = { ...DEFAULT_DIRECTORY_QUERY, search: "ana maría", grade: "11", assessment: "mil" as const, state: "completed" as const, page: 2 };

  it("defaults are left out (clean URLs)", () => {
    expect(studentsListHref(DEFAULT_DIRECTORY_QUERY)).toBe("/school-admin/students");
    expect(directoryParams({ ...DEFAULT_DIRECTORY_QUERY, page: 1 }).toString()).toBe("");
  });

  it("list URL round-trips", () => {
    const href = studentsListHref(q);
    expect(href).toBe("/school-admin/students?search=ana+mar%C3%ADa&grade=11&assessment=mil&state=completed&page=2");
    expect(read(href.split("?")[1])).toEqual({ ...q, sort: "name", dir: "asc" });
  });

  it("a student's URL opens Results & Answers and keeps the list it came from", () => {
    const href = studentHref("stu 1", q);
    expect(href.startsWith("/school-admin/users/stu%201?")).toBe(true);
    const p = new URLSearchParams(href.split("?")[1]);
    expect(p.get("tab")).toBe("record");
    expect(read(p.toString())).toEqual({ ...q, sort: "name", dir: "asc" });
    expect(new URLSearchParams(studentHref("s", q, "notes").split("?")[1]).get("tab")).toBe("notes");
  });

  it("the page can be left out (previous / next ignore paging)", () => {
    expect(directoryParams(q, { withPage: false }).has("page")).toBe(false);
  });

  it("isFiltered ignores sort and page", () => {
    expect(isFiltered({ ...DEFAULT_DIRECTORY_QUERY, sort: "grade", page: 4 })).toBe(false);
    expect(isFiltered({ ...DEFAULT_DIRECTORY_QUERY, state: "in_progress" })).toBe(true);
  });
});
