import { completionFraction } from "../assessmentProgressService";

// Audit D13: the Assessments page header and the dashboard card must show the same "N/M completed".
describe("completionFraction", () => {
  it("uses the server's completed/total", () => {
    expect(completionFraction({ overallCompletion: 50, completedAssessments: 2, totalAssessments: 4 })).toEqual({ completed: 2, total: 4, percent: 50 });
  });
  it("a grandfathered student at 100% reads 4/4, not 3/4", () => {
    expect(completionFraction({ overallCompletion: 100, completedAssessments: 3, totalAssessments: 4 })).toEqual({ completed: 4, total: 4, percent: 100 });
  });
  it("defaults to 0 of 4 before the summary loads", () => {
    expect(completionFraction(undefined)).toEqual({ completed: 0, total: 4, percent: 0 });
  });
});
