import { render, screen, fireEvent } from "@testing-library/react";
import { DimensionBreakdown } from "../_components/DimensionBreakdown";
import type { DimensionScore } from "@/services/vocationalReportService";

const dims = [
  { key: "intereses", nameEs: "Intereses Académicos", score: 75, band: "moderateHigh", byGroup: { self: 80, parent: 70 } },
  { key: "habilidades", nameEs: "Habilidades", score: null, band: null, byGroup: {} as Record<string, number> },
] satisfies DimensionScore[];

it("renders each dimension with its score and band", () => {
  render(<DimensionBreakdown dimensions={dims} />);
  expect(screen.getByText("Intereses Académicos")).toBeInTheDocument();
  expect(screen.getByText(/75/)).toBeInTheDocument();
  expect(screen.getByText(/no responses/i)).toBeInTheDocument(); // null-score dim
});

it("expands a dimension to show per-group breakdown", () => {
  render(<DimensionBreakdown dimensions={dims} />);
  fireEvent.click(screen.getByRole("button", { name: /Intereses Académicos/i }));
  expect(screen.getByText(/self/i)).toBeInTheDocument();
  expect(screen.getByText(/parent/i)).toBeInTheDocument();
});
