/**
 * Personality results — renders resolved type, the dimension radar, and at
 * least one narrative section.
 */
import { render, screen, waitFor } from "@testing-library/react";
import PersonalityResultsPage from "@/app/dashboard/assessments/personality/results/page";
import { personalityApi } from "@/services/personalityService";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "en" },
  }),
}));

jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: new Proxy(
      {},
      {
        get: () => ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
      },
    ),
  };
});

// Recharts measures 0x0 in jsdom and renders nothing; stub it so the radar is
// assertable as a presence marker.
jest.mock("recharts", () => {
  const React = require("react");
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => React.createElement("div", {}, children),
    RadarChart: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "radar-chart" }, children),
    Radar: () => React.createElement("div", null),
    PolarGrid: () => null,
    PolarAngleAxis: () => null,
    PolarRadiusAxis: () => null,
  };
});

jest.mock("@/store/useGlobalStore", () => {
  const store = { language: "english", user: { id: "u1" } };
  const useGlobalStore = () => store;
  return { useGlobalStore };
});

jest.mock("@/services/personalityService", () => ({
  personalityApi: { getUserResults: jest.fn() },
}));

const mockResults = personalityApi.getUserResults as jest.Mock;

const dimensionScores = [
  { dimension: "EI", firstCount: 8, secondCount: 2, winningPole: "E", intensity: 8, answered: 10, maxPerDimension: 10, normalizedIntensity: 80, balanced: false },
  { dimension: "SN", firstCount: 6, secondCount: 4, winningPole: "S", intensity: 6, answered: 10, maxPerDimension: 10, normalizedIntensity: 60, balanced: false },
  { dimension: "TF", firstCount: 7, secondCount: 3, winningPole: "T", intensity: 7, answered: 10, maxPerDimension: 10, normalizedIntensity: 70, balanced: false },
  { dimension: "JP", firstCount: 9, secondCount: 1, winningPole: "J", intensity: 9, answered: 10, maxPerDimension: 10, normalizedIntensity: 90, balanced: false },
];

describe("PersonalityResultsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResults.mockResolvedValue({
      session_id: "sess-1",
      user_name: "Test Student",
      variant: "estudiantil",
      language: "en",
      type: "ESTJ",
      score: { variant: "estudiantil", type: "ESTJ", dimensions: {} },
      dimension_scores: dimensionScores,
      profile: {
        type: "ESTJ",
        alias: "The Executive",
        tagline: "Organized and decisive.",
        description: "You are a natural organizer.",
        strengths: ["Leadership", "Reliability"],
        weaknesses: ["Impatience"],
        improvementAreas: ["Flexibility"],
        howToDevelop: ["Listen more"],
        motivation: ["Achievement"],
        howToWorkWith: ["Be direct"],
        communication: ["Clear and factual"],
        potential: { social: "Community leader", laboral: "Operations manager" },
        coachingStrategy: { objective: "Build empathy", practices: ["Weekly reflection"] },
      },
      started_at: null,
      completed_at: null,
      violation_count: 0,
      flag_for_review: false,
    });
  });

  it("renders the resolved type, radar, and a narrative section", async () => {
    render(<PersonalityResultsPage />);

    // Resolved type + alias hero.
    await waitFor(() => expect(screen.getByText("The Executive")).toBeInTheDocument());
    expect(screen.getAllByText("ESTJ").length).toBeGreaterThan(0);

    // Radar rendered.
    expect(screen.getByTestId("radar-chart")).toBeInTheDocument();

    // At least one narrative section (description text + a strength).
    expect(screen.getByText("You are a natural organizer.")).toBeInTheDocument();
    expect(screen.getByText("Leadership")).toBeInTheDocument();
  });
});
