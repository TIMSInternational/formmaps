import { render, screen } from "@testing-library/react";
import { TimelineStats } from "../TimelineStats";
import type { TimelineStats as Stats } from "@/types/timeline";

jest.mock("react-i18next", () => {
  const en = require("@/lib/i18n/locales/en/common.json");
  return {
    useTranslation: () => ({
      t: (key: string) => key.split(".").reduce((o: Record<string, unknown>, k) => o?.[k] as never, en) ?? key,
      i18n: { language: "en" },
    }),
  };
});

jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({ language: "english", user: { id: "u1" } }),
}));

const mockProgress = jest.fn();
jest.mock("@/hooks/useAssessmentQueries", () => ({
  useAssessmentProgress: () => ({ data: mockProgress() }),
}));

// What the timeline report returns today: 3 instruments, no Personality.
const stats: Stats = {
  overallCompletion: { percentage: 0, completedAssessments: 0, totalAssessments: 3 },
  recentActivity: { lastActivityDate: null, eventsThisWeek: 0, eventsThisMonth: 0 },
  assessmentBreakdown: {
    pca: { status: "not_started" },
    mil: { status: "not_started", completedSubtests: 0, totalSubtests: 5 },
    evaluation: { status: "not_started", completedEvaluations: 0, totalEvaluators: 0 },
    courses: { enrolled: 0, inProgress: 0, completed: 0, averageProgress: 0 },
  },
} as Stats;

describe("TimelineStats (#398)", () => {
  it("counts the same N as the Dashboard (of 4) and shows a Personality chip for a 0/4 student", () => {
    mockProgress.mockReturnValue({
      pcaAssessment: { status: "not_started" },
      milAssessment: { status: "not_started" },
      evaluationAssessment: { status: "not_started" },
      personalityAssessment: { status: "not_started" },
      overallCompletion: { totalAssessments: 4, completedAssessments: 0, percentageComplete: 0 },
    });
    render(<TimelineStats stats={stats} />);
    expect(screen.getByText("0/4")).toBeInTheDocument();
    expect(screen.queryByText("0/3")).toBeNull();
    for (const chip of ["PCA", "LIA", "360°", "Personality", "Courses"]) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
  });

  it("takes per-instrument status from assessment progress, not the timeline report", () => {
    mockProgress.mockReturnValue({
      pcaAssessment: { status: "completed" },
      milAssessment: { status: "completed" },
      evaluationAssessment: { status: "in_progress" },
      personalityAssessment: { status: "completed" },
      overallCompletion: { totalAssessments: 4, completedAssessments: 3, percentageComplete: 75 },
    });
    render(<TimelineStats stats={stats} />);
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});
