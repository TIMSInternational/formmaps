import { isCareerJourneyComplete } from "../journeyStatus";

describe("student dashboard journey status", () => {
  it("uses the API's explicit careerProfileComplete field even when no AI summary exists", () => {
    expect(isCareerJourneyComplete({ careerProfileComplete: true, aiSummary: null })).toBe(true);
  });

  it("keeps legacy summary fields as a compatible completion signal", () => {
    expect(isCareerJourneyComplete({ aiSummary: "Profile summary" })).toBe(true);
    expect(isCareerJourneyComplete({ AiSummary: "Legacy profile summary" })).toBe(true);
  });

  it("does not mark careers complete when no completion signal exists", () => {
    expect(isCareerJourneyComplete({ activeCourses: 2, portfolioItems: 1 })).toBe(false);
    expect(isCareerJourneyComplete(null)).toBe(false);
  });
});
