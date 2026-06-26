import { render, screen } from "@testing-library/react";
import { ReadinessChecklist } from "../_components/ReadinessChecklist";

it("marks 360 ready and PCA/MIL missing", () => {
  render(<ReadinessChecklist
    score={{ status: "ready", composite: 80, band: "strong", respondentCount: 2, groupsIncluded: ["self", "parent"], dimensionScores: [], rankings: { interests: [], industries: [], workType: null, openInsights: [] } }}
    integrated={{ status: "not_ready", missing: ["pca", "mil"] }} />);
  expect(screen.getByText(/360/)).toBeInTheDocument();
  expect(screen.getByText(/PCA \(Professional Competencies\)/)).toBeInTheDocument();
  expect(screen.getByText(/MIL \(Cognitive\)/)).toBeInTheDocument();
  // 360 row shows a ready indicator (aria-label or text)
  expect(screen.getByLabelText(/360 Evaluation ready/i)).toBeInTheDocument();
});
