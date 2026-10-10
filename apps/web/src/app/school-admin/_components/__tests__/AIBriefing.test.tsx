import "@/lib/i18n";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as apiClientModule from "@/lib/api/apiClient";
import { AIBriefing } from "../AIBriefing";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiClientModule.apiRequest as jest.Mock;

function renderBriefing() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AIBriefing />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Generate Briefing/ }));
}

// Audit D8: below the completion gate the API returns no narrative and the card rendered nothing.
describe("School-admin AI briefing", () => {
  beforeEach(() => mockApiRequest.mockReset());

  it("explains the gate and shows the school's progress when below it", async () => {
    mockApiRequest.mockResolvedValue({
      data: { weeklyBriefing: "", urgentActions: [], gating: { eligible: false, completed: 7, total: 10, completionRate: 70, threshold: 90 } },
    });
    renderBriefing();
    expect(await screen.findByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.getByText(/7 of 10 students have completed all assessments \(70%\)\. The AI briefing unlocks at 90%\./)).toBeInTheDocument();
  });

  it("says the briefing could not be generated when eligible but empty", async () => {
    mockApiRequest.mockResolvedValue({ data: { weeklyBriefing: "", urgentActions: [], gating: { eligible: true } } });
    renderBriefing();
    expect(await screen.findByText(/could not be generated/)).toBeInTheDocument();
  });

  it("renders the briefing and translated impact labels when there is one", async () => {
    mockApiRequest.mockResolvedValue({
      data: { weeklyBriefing: "All good.", urgentActions: [{ title: "Do X", description: "Because", impact: "high" }], gating: { eligible: true } },
    });
    renderBriefing();
    expect(await screen.findByText("All good.")).toBeInTheDocument();
    expect(screen.getByText("high impact")).toBeInTheDocument();
  });
});
