import { countCourseRigor, buildGpaTrend } from "../transcriptDerive";

describe("countCourseRigor", () => {
  it("returns zeros for empty byYear", () => {
    expect(countCourseRigor({})).toEqual({ ap: 0, honors: 0, ib: 0 });
  });

  it("counts AP courses case-insensitively", () => {
    const byYear = {
      "2023-2024": [
        { courseLevel: "AP" },
        { courseLevel: "ap" },
        { courseLevel: "Ap" },
      ],
    };
    const result = countCourseRigor(byYear);
    expect(result.ap).toBe(3);
    expect(result.honors).toBe(0);
    expect(result.ib).toBe(0);
  });

  it("counts Honors courses case-insensitively", () => {
    const byYear = {
      "2023-2024": [
        { courseLevel: "Honors" },
        { courseLevel: "HONORS" },
        { courseLevel: "honors" },
      ],
    };
    const result = countCourseRigor(byYear);
    expect(result.honors).toBe(3);
    expect(result.ap).toBe(0);
    expect(result.ib).toBe(0);
  });

  it("counts IB courses case-insensitively", () => {
    const byYear = {
      "2023-2024": [
        { courseLevel: "IB" },
        { courseLevel: "ib" },
      ],
    };
    const result = countCourseRigor(byYear);
    expect(result.ib).toBe(2);
    expect(result.ap).toBe(0);
    expect(result.honors).toBe(0);
  });

  it("counts mixed levels across multiple years", () => {
    const byYear = {
      "2022-2023": [
        { courseLevel: "AP" },
        { courseLevel: "honors" },
        { courseLevel: "regular" },
        { courseLevel: null },
      ],
      "2023-2024": [
        { courseLevel: "IB" },
        { courseLevel: "AP" },
        { courseLevel: "Honors" },
      ],
    };
    const result = countCourseRigor(byYear);
    expect(result.ap).toBe(2);
    expect(result.honors).toBe(2);
    expect(result.ib).toBe(1);
  });

  it("ignores null course levels", () => {
    const byYear = {
      "2023-2024": [
        { courseLevel: null },
        { courseLevel: null },
      ],
    };
    expect(countCourseRigor(byYear)).toEqual({ ap: 0, honors: 0, ib: 0 });
  });
});

describe("buildGpaTrend", () => {
  it("returns empty array for null input", () => {
    expect(buildGpaTrend(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(buildGpaTrend(undefined)).toEqual([]);
  });

  it("returns empty array for empty object", () => {
    expect(buildGpaTrend({})).toEqual([]);
  });

  it("emits chronological points sorted oldest to newest", () => {
    const breakdown = {
      "2024-2025": { gpaUnweighted: 3.9, gpaWeighted: 4.4 },
      "2022-2023": { gpaUnweighted: 3.5, gpaWeighted: 3.9 },
      "2023-2024": { gpaUnweighted: 3.7, gpaWeighted: 4.1 },
    };
    const result = buildGpaTrend(breakdown);
    expect(result).toHaveLength(3);
    expect(result[0].year).toBe("2022-2023");
    expect(result[1].year).toBe("2023-2024");
    expect(result[2].year).toBe("2024-2025");
  });

  it("maps gpaUnweighted and gpaWeighted from breakdown", () => {
    const breakdown = {
      "2023-2024": { gpaUnweighted: 3.75, gpaWeighted: 4.2 },
    };
    const result = buildGpaTrend(breakdown);
    expect(result[0]).toEqual({
      year: "2023-2024",
      gpaUnweighted: 3.75,
      gpaWeighted: 4.2,
    });
  });

  it("handles null gpa values in breakdown", () => {
    const breakdown = {
      "2023-2024": { gpaUnweighted: null, gpaWeighted: null },
    };
    const result = buildGpaTrend(breakdown);
    expect(result[0].gpaUnweighted).toBeNull();
    expect(result[0].gpaWeighted).toBeNull();
  });
});
