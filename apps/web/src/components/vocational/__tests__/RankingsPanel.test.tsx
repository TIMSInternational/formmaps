import { render, screen } from "@testing-library/react";
import { RankingsPanel } from "../_components/RankingsPanel";

it("renders interests, industries, work type and open insights", () => {
  render(<RankingsPanel rankings={{
    interests: [{ value: "ingenieria", points: 19.6 }],
    industries: [{ value: "tech", count: 2 }],
    workType: { value: "independiente", count: 1 },
    openInsights: [{ group: "self", text: "Me gusta resolver problemas" }],
  }} />);
  expect(screen.getByText(/ingenieria/i)).toBeInTheDocument();
  expect(screen.getByText(/tech/i)).toBeInTheDocument();
  expect(screen.getByText(/independiente/i)).toBeInTheDocument();
  expect(screen.getByText(/Me gusta resolver problemas/i)).toBeInTheDocument();
});
