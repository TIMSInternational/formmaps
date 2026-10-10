/** Audit 2026-10-09 D11: blank-department rows were imported; failures had no line numbers. */
import { parseCourseCsv } from "../courseCsv";

it("rejects rows without a department (and code/name) with their file line numbers", () => {
  const csv = [
    "code,name,department,credits,grade_levels,honors",
    "ENG9,English 9,English,1,9,no",
    "",
    "MATH9,Algebra I,,1,9;10,no",
    ",No code,Math,1,9,no",
    "SCI9,,Science,1,9,no",
    'ART1,"Art, Studio",Arts,0.5,9|10|11,yes',
  ].join("\r\n");
  const r = parseCourseCsv(csv);
  expect(r.rows.map((x) => x.course.code)).toEqual(["ENG9", "ART1"]);
  expect(r.rejected).toEqual([
    { line: 4, reason: "missingDepartment" },
    { line: 5, reason: "missingCode" },
    { line: 6, reason: "missingName" },
  ]);
  const art = r.rows[1];
  expect(art.line).toBe(7);
  expect(art.course).toMatchObject({ name: "Art, Studio", credits: 0.5, gradeLevels: [9, 10, 11], isHonors: true });
});

it("an empty file has no rows", () => {
  expect(parseCourseCsv("\n\n")).toEqual({ rows: [], rejected: [] });
});
