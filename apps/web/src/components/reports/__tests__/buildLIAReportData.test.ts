import { buildLIAReportData } from "../buildLIAReportData";

describe("buildLIAReportData", () => {
  const input = {
    user: { id: "user-123", name: "Maria Garcia", email: "maria@formmaps.dev" },
    overallScore: 73,
    averageAccuracy: 81,
    subtests: [
      { name: "Feature Detection", score: 85, accuracy: 90 },
      { name: "Verbal Reasoning", score: 61, accuracy: 70 },
    ],
  };

  it("maps the real user name, overall score, and per-domain scores", () => {
    const out = buildLIAReportData(input);
    expect(out.user.name).toBe("Maria Garcia");
    expect(out.user.id).toBe("user-123");
    expect(out.user.email).toBe("maria@formmaps.dev");
    expect(out.overallScore.percentage).toBe(73);
    expect(out.subtests).toHaveLength(2);
    expect(out.subtests[0].name).toBe("Feature Detection");
    expect(out.subtests[0].score).toBe(85);
    expect(out.subtests[0].accuracy).toBe(90);
    expect(out.subtests[1].name).toBe("Verbal Reasoning");
    expect(out.subtests[1].score).toBe(61);
  });

  it("does NOT emit the dummy Alex Johnson / 78.5 values", () => {
    const out = buildLIAReportData(input);
    expect(out.user.name).not.toBe("Alex Johnson");
    expect(out.overallScore.percentage).not.toBe(78.5);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("Alex Johnson");
    expect(serialized).not.toContain("alex.johnson@example.com");
    expect(serialized).not.toContain("Numeric Speed"); // dummy-only subtest
  });

  it("leaves percentile/band/classification empty (does NOT fabricate them)", () => {
    const out = buildLIAReportData(input);
    // No real percentile data yet — must be null, not a made-up number.
    expect(out.overallScore.percentileRank).toBeNull();
    expect(out.overallScore.classification).toBe("");
    expect(out.subtests[0].percentile).toBeNull();
    // Narrative fields must be empty, not invented prose.
    expect(out.subtests[0].interpretation).toBe("");
    expect(out.executiveSummary.highlights).toEqual([]);
    expect(out.executiveSummary.developmentAreas).toEqual([]);
    expect(out.executiveSummary.strategicImplications).toBe("");
    expect(out.cognitiveSynergy).toBe("");
    expect(out.careerRecommendations.roles).toEqual([]);
    expect(out.summary.keyTakeaways).toEqual([]);
  });

  it("includes a real report date", () => {
    const out = buildLIAReportData(input);
    expect(out.reportDate).toBeTruthy();
    expect(Number.isNaN(new Date(out.reportDate).getTime())).toBe(false);
  });

  it("falls back to a neutral user label when name is missing", () => {
    const out = buildLIAReportData({ ...input, user: { id: "u", name: null, email: null } });
    expect(out.user.name).not.toBe("Alex Johnson");
    expect(out.user.name.length).toBeGreaterThan(0);
  });
});
