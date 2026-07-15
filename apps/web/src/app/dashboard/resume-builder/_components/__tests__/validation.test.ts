/**
 * Audit 2026-07-01 LOW: validateEducation read requiredFields[4] (Work
 * Experience, minItems 0 → always valid) and validateSkills read
 * requiredFields[5] (Education, minItems 1 → only one skill required instead
 * of three). Both were off by one against the step table.
 */
import { validateEducation, validateSkills } from "../validation";

describe("resume-builder step validation indices", () => {
  it("education requires at least one entry", () => {
    const empty = validateEducation([]);
    expect(empty.isValid).toBe(false);
    expect(empty.completionPercentage).toBe(0);

    const one = validateEducation([
      { degree: "BSc", institution: "VT", graduationDate: "2026" },
    ]);
    expect(one.isValid).toBe(true);
    expect(one.completionPercentage).toBe(100);
  });

  it("skills require three entries, not one", () => {
    const one = validateSkills(["TypeScript"]);
    expect(one.isValid).toBe(false);
    expect(Math.round(one.completionPercentage)).toBe(33);

    const three = validateSkills(["TypeScript", "SQL", "React"]);
    expect(three.isValid).toBe(true);
    expect(three.completionPercentage).toBe(100);
  });
});
