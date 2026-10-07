/**
 * Admin → Users → "View profile & results" (lib/actingSchool.ts openStudent / isStudentDetailPath).
 * A student in a school opens INSIDE that school; an independent student opens with none, and only a page about
 * ONE student may render for a Super Admin without a school (every other school-admin page shows the picker).
 */
import { getActingSchool, isStudentDetailPath, openStudent, setActingSchool } from "@/lib/actingSchool";

const assign = jest.fn();
beforeEach(() => {
  assign.mockClear();
  window.sessionStorage.clear();
});

describe("isStudentDetailPath", () => {
  it.each(["/school-admin/users/abc", "/school-admin/users/abc/", "/school-admin/students/abc"])("%s is a student page", (p) => {
    expect(isStudentDetailPath(p)).toBe(true);
  });

  it.each(["/school-admin", "/school-admin/users", "/school-admin/users/abc/edit", "/school-admin/settings", "/admin/users/abc", null])(
    "%s is not",
    (p) => {
      expect(isStudentDetailPath(p)).toBe(false);
    },
  );
});

describe("openStudent", () => {
  it("a student in a school opens inside that school", () => {
    openStudent("stu-1", { id: "school-a", name: "Academy A" }, assign);
    expect(getActingSchool()).toEqual({ id: "school-a", name: "Academy A" });
    expect(assign).toHaveBeenCalledWith("/school-admin/users/stu-1");
  });

  it("an independent student opens with NO school — a school left open earlier in the tab is forgotten", () => {
    setActingSchool({ id: "school-a", name: "Academy A" });
    openStudent("stu-2", null, assign);
    expect(getActingSchool()).toBeNull();
    expect(assign).toHaveBeenCalledWith("/school-admin/users/stu-2");
  });

  it("the id is encoded into the path", () => {
    openStudent("a/b?c", null, assign);
    expect(assign).toHaveBeenCalledWith("/school-admin/users/a%2Fb%3Fc");
  });
});
