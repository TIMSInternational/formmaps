import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { InsightsCard } from "../InsightsCard";
import type { InsightsData } from "@/services/assessmentCommandService";

const insightsWithData: InsightsData = {
  hasEnoughData: true,
  aggregates: {
    totalStudents: 42,
    profilesComplete: 30,
    pcaAverages: { PatternRecognition: 78, VerbalReasoning: 65 },
    discDistribution: { D: 5, I: 8, S: 12, C: 5 },
    milAverages: null,
    topCareerClusters: [{ name: "Technology", count: 9 }],
    eval360Count: 14,
  },
  narrative: "# Title\n\n**Key concern:** something\n\n- bullet one",
};

const insightsNoData: InsightsData = {
  hasEnoughData: false,
  message: "Insights will appear once enough students complete assessments.",
};

describe("InsightsCard", () => {
  it("renders the narrative as markdown (heading, bold, list) — not literal markdown", () => {
    const { getByRole, getByText, container } = render(
      <InsightsCard insights={insightsWithData} onRefresh={() => {}} isRefreshing={false} />
    );

    // Heading element rendered from "# Title"
    expect(getByRole("heading", { name: /Title/i })).toBeInTheDocument();
    // Bold rendered from "**Key concern:**"
    const strong = getByText("Key concern:");
    expect(strong.tagName.toLowerCase()).toBe("strong");
    // List item rendered from "- bullet one"
    const li = getByText("bullet one");
    expect(li.tagName.toLowerCase()).toBe("li");

    // The raw markdown characters must NOT be visible as literal text
    expect(container.textContent).not.toContain("# Title");
    expect(container.textContent).not.toContain("**Key concern:**");
  });

  it("renders the fallback message when there is not enough data", () => {
    const { getByText } = render(
      <InsightsCard insights={insightsNoData} onRefresh={() => {}} isRefreshing={false} />
    );
    expect(
      getByText(/Insights will appear once enough students complete assessments\./i)
    ).toBeInTheDocument();
  });
});
