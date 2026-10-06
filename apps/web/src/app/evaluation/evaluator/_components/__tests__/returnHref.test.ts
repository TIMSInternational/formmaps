import { evaluatorReturnHref } from "../returnHref";

it.each([
  [{ isAuthenticated: true, role: "student" }, "/dashboard/assessments/evaluation"],
  [{ isAuthenticated: true, role: "Student" }, "/dashboard/assessments/evaluation"],
  [{ isAuthenticated: true, role: "parent" }, "/parent/evaluations"],
  [{ isAuthenticated: true, role: "teacher" }, "/teacher/evaluations"],
  [{ isAuthenticated: true, role: "counselor" }, "/dashboard"],
  [{ isAuthenticated: false, role: "student" }, undefined],
  [null, undefined],
])("%j → %p", (user, href) => {
  expect(evaluatorReturnHref(user)).toBe(href);
});
