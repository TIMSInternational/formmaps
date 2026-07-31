import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
import CareerCard from "../CareerCard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/components/I18nProvider";

const baseCareer = {
  id: "career_data_analyst",
  title: { en: "Data Analyst", es: "Analista de Datos" },
  shortDescription: {
    en: "Analyze and interpret data",
    es: "Analiza e interpreta datos",
  },
  industries: ["Technology"],
};

function renderCard(career: Record<string, unknown>) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <CareerCard career={career as never} />
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe("CareerCard", () => {
  it("renders title and short description", () => {
    const { getByText } = renderCard({ ...baseCareer, matchScore: 92 });
    expect(getByText(/Data Analyst/i)).toBeInTheDocument();
    expect(getByText(/Analyze and interpret data/i)).toBeInTheDocument();
  });

  // finding 1: engine floor is ~25, so any 0% on screen means "not scored",
  // never "bad match". An unscored (explore) card must NOT show a percentage.
  it("shows the explore affordance and NO percentage when matchScore is undefined", () => {
    const { queryByText, getByText } = renderCard({ ...baseCareer });
    expect(queryByText(/%/)).toBeNull();
    expect(queryByText(/0%/)).toBeNull();
    expect(getByText(/Explore/i)).toBeInTheDocument();
  });

  it("suppresses the badge when matchScore is 0 (unscored)", () => {
    const { queryByText } = renderCard({ ...baseCareer, matchScore: 0 });
    expect(queryByText(/%/)).toBeNull();
  });

  it("renders the match percentage when scored (82%)", () => {
    const { getByText, getByLabelText } = renderCard({ ...baseCareer, matchScore: 82 });
    expect(getByText(/82%/)).toBeInTheDocument();
    expect(getByLabelText(/82% match/i)).toBeInTheDocument();
  });
});
