import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
import CareerCard from "../CareerCard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/components/I18nProvider";
import { useGlobalStore } from "@/store/useGlobalStore";

const sampleCareer = {
  id: "career_data_analyst",
  title: { en: "Data Analyst", es: "Analista de Datos" },
  shortDescription: {
    en: "Analyze and interpret data",
    es: "Analiza e interpreta datos",
  },
  industries: ["Technology"],
  matchScore: 92,
} as any;

describe("CareerCard", () => {
  it("renders title, short description and match score", () => {
    const client = new QueryClient();
    const { getByText } = render(
      <QueryClientProvider client={client}>
        <I18nProvider>
          <CareerCard career={sampleCareer} />
        </I18nProvider>
      </QueryClientProvider>
    );
    expect(getByText(/Data Analyst/i)).toBeInTheDocument();
    expect(getByText(/Analyze and interpret data/i)).toBeInTheDocument();
    expect(getByText(/Match: 92%/i)).toBeInTheDocument();
  });
});
