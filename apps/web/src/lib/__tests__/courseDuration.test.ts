import { formatCourseDuration } from "../courseDuration";

// #397: the live catalog has no duration for most courses (duration = 0), which
// rendered "0 weeks" / "0 semanas" chips and a bare "0" in Suggested Next.
const t = (key: string) => ({ "courses.week": "semana", "courses.weeks": "semanas" } as Record<string, string>)[key] ?? key;

describe("formatCourseDuration", () => {
  it.each([0, null, undefined, -3, Number.NaN])("returns null (hide the chip) for %p", (duration) => {
    expect(formatCourseDuration(duration, t)).toBeNull();
  });

  it("formats singular and plural weeks with the translated unit", () => {
    expect(formatCourseDuration(1, t)).toBe("1 semana");
    expect(formatCourseDuration(6, t)).toBe("6 semanas");
  });
});
