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

  describe("weightedComposite mapping", () => {
    const compositeInput = {
      user: { id: "user-123", name: "Maria Garcia", email: "maria@formmaps.dev" },
      overallScore: 73,
      averageAccuracy: 81,
      weightedComposite: {
        raw: 198,
        percent: 66,
        band: "Excede",
        labelEn: "Exceeds",
        color: "#059669",
        perDomain: [
          { type: "PatternRecognition", percent: 85, weight: 20, band: "Excepcional", labelEn: "Exceptional", color: "#2E9098" },
          { type: "VerbalReasoning", percent: 61, weight: 40, band: "Excede", labelEn: "Exceeds", color: "#059669" },
        ],
      },
      subtests: [
        { name: "Feature Detection", score: 85, accuracy: 90, examId: "feature-detection-001" },
        { name: "Verbal Reasoning", score: 61, accuracy: 70, examId: "verbal-reasoning-001" },
      ],
    };

    it("sets overall classification to the composite labelEn (percentile stays null)", () => {
      const out = buildLIAReportData(compositeInput);
      expect(out.overallScore.classification).toBe("Exceeds");
      expect(out.overallScore.percentileRank).toBeNull();
    });

    it("headline score uses the composite percent (same metric as the band), NOT the unweighted average", () => {
      // compositeInput.overallScore (unweighted) is 73 but the composite percent is 66.
      // The report must show 66 so the score and the "Exceeds" band can't contradict.
      const out = buildLIAReportData(compositeInput);
      expect(out.overallScore.percentage).toBe(66);
      expect(out.overallScore.percentage).not.toBe(73);
    });

    it("maps each subtest's interpretation to its per-domain band labelEn (matched by examId)", () => {
      const out = buildLIAReportData(compositeInput);
      expect(out.subtests[0].interpretation).toBe("Exceptional");
      expect(out.subtests[1].interpretation).toBe("Exceeds");
    });

    it("does NOT fabricate percentiles even with a composite present", () => {
      const out = buildLIAReportData(compositeInput);
      expect(out.subtests[0].percentile).toBeNull();
      expect(out.subtests[1].percentile).toBeNull();
    });

    it("leaves subtest interpretation empty when no matching per-domain band", () => {
      const out = buildLIAReportData({
        ...compositeInput,
        subtests: [{ name: "Working Memory", score: 50, accuracy: 60, examId: "working-memory-001" }],
      });
      expect(out.subtests[0].interpretation).toBe("");
    });
  });

  it("produces a valid band-less report when weightedComposite is absent (no crash)", () => {
    const out = buildLIAReportData(input);
    expect(out.overallScore.classification).toBe("");
    expect(out.subtests[0].interpretation).toBe("");
    expect(out.subtests[1].interpretation).toBe("");
    expect(out.overallScore.percentileRank).toBeNull();
  });
});
