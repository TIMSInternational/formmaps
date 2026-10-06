/**
 * formmaps-platform#405: the Portfolio card read "1items" in Spanish — the sub-labels were
 * hard-coded English and not plural-aware.
 */
import { render, screen, act } from "@testing-library/react";
import i18n from "@/lib/i18n";

jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({ user: { id: "u1" } }),
}));
jest.mock("@/hooks/useAssessmentQueries", () => ({
  useDashboardAssessmentSummary: () => ({ data: { assessments: [], overallCompletion: 0 }, isLoading: false }),
}));
jest.mock("@/hooks/useTimsQueries", () => ({
  useTimsCareerScoring: () => ({ data: { data: { locked: false, careers: [{ totalScore: 87 }] } }, isLoading: false }),
}));
let mockPortfolio = { totalItems: 1, totalVolunteerHours: 0 };
jest.mock("@/hooks/usePortfolioQueries", () => ({
  usePortfolioSummary: () => ({ data: mockPortfolio, isLoading: false }),
}));

import { StatCards } from "../StatCards";

async function lang(l: string) {
  await act(async () => {
    await i18n.changeLanguage(l);
  });
}

describe("StatCards i18n", () => {
  afterEach(() => lang("en"));

  it("uses a singular Spanish label for one portfolio item", async () => {
    await lang("es");
    mockPortfolio = { totalItems: 1, totalVolunteerHours: 0 };
    render(<StatCards activeCourses={2} />);
    expect(screen.getByText("elemento")).toBeInTheDocument();
    expect(screen.getByText("inscritos")).toBeInTheDocument();
    expect(screen.getByText("Mejor: 87%")).toBeInTheDocument();
    expect(screen.queryByText(/items/)).not.toBeInTheDocument();
  });

  it("pluralizes and localizes volunteer hours", async () => {
    await lang("es");
    mockPortfolio = { totalItems: 3, totalVolunteerHours: 12 };
    render(<StatCards />);
    expect(screen.getByText("12 h de voluntariado")).toBeInTheDocument();
  });

  it("keeps English labels plural-aware", async () => {
    mockPortfolio = { totalItems: 1, totalVolunteerHours: 0 };
    render(<StatCards />);
    expect(screen.getByText("item")).toBeInTheDocument();
  });
});
