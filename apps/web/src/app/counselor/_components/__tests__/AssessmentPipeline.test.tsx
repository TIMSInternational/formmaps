import "@/lib/i18n";
import React from "react";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as apiClientModule from "@/lib/api/apiClient";
import { AssessmentPipeline } from "../AssessmentPipeline";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockApiRequest = apiClientModule.apiRequest as jest.Mock;

// Audit D1: the counselor pipeline read pcaExams / milStatus / eval360Status ("completed"), which the
// API never returns — every cell said "not started". It now reads lia / pcaStatus / eval360 ("done").
describe("Counselor AssessmentPipeline", () => {
  it("shows the API's LIA subtests, real PCA and 360 statuses", async () => {
    mockApiRequest.mockResolvedValue({
      data: [{
        id: "s1", name: "Ana", gradeLevel: 11,
        lia: { PatternRecognition: "done", VerbalReasoning: "done", WorkingMemory: "done", NumericVelocity: "done", VisualRotation: "in_progress" },
        pcaStatus: "done", eval360: "in_progress",
      }],
    });
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AssessmentPipeline />
      </QueryClientProvider>,
    );
    const row = (await screen.findByText("Ana")).closest("tr")!;
    // 4 done subtests + done PCA = 5 checks; the in-progress subtest and 360 are amber dots.
    expect(row.querySelectorAll("svg.text-green-600")).toHaveLength(5);
    expect(row.querySelectorAll("span.bg-amber-400")).toHaveLength(2);
    expect(within(container.querySelector("thead")!).getByText("MIL / LIA")).toBeInTheDocument();
    expect(within(container.querySelector("thead")!).getByText("PCA")).toBeInTheDocument();
  });
});
