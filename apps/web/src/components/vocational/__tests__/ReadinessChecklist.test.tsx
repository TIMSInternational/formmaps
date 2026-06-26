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

it("never_computed integrated → PCA and MIL are NOT ready even when 360 is ready", () => {
  render(<ReadinessChecklist
    score={{ status: "ready", composite: 80, band: "strong", respondentCount: 2, groupsIncluded: ["self", "parent"], dimensionScores: [], rankings: { interests: [], industries: [], workType: null, openInsights: [] } }}
    integrated={{ status: "never_computed" }} />);
  // PCA and MIL rows render the pending (not-ready) indicator
  expect(screen.getByLabelText(/PCA.*pending/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/MIL.*pending/i)).toBeInTheDocument();
  // 360 itself is still ready
  expect(screen.getByLabelText(/360 Evaluation ready/i)).toBeInTheDocument();
});
