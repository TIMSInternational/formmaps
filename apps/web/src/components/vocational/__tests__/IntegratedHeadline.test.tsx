import { render, screen } from "@testing-library/react";
import { IntegratedHeadline } from "../_components/IntegratedHeadline";

it("renders the composite + component bars when ready", () => {
  render(<IntegratedHeadline integrated={{ status: "ready", integratedComposite: 84.1, band: "strong", threeSixtyScore: 87.8, pcaScore: 83.3, milScore: 80, weightsApplied: { threeSixty: 0.4, pca: 0.3, mil: 0.3 } }} />);
  expect(screen.getByText(/84.1/)).toBeInTheDocument();
  expect(screen.getByText(/strong/i)).toBeInTheDocument();
  expect(screen.getByText(/360/)).toBeInTheDocument();
});

it("renders an unlock note when not ready", () => {
  render(<IntegratedHeadline integrated={{ status: "not_ready", missing: ["mil"] }} />);
  expect(screen.getByText(/unlock|complete/i)).toBeInTheDocument();
  expect(screen.queryByText(/84.1/)).not.toBeInTheDocument();
});
