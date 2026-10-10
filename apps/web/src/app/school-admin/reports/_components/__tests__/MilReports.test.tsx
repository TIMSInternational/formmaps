import "@/lib/i18n";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as apiClientModule from "@/lib/api/apiClient";
import { StudentReportPanel } from "../StudentReportPanels";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
jest.mock("@/services/pcaImageService", () => ({ getPcaChartBlob: jest.fn(), getPcaReportBlob: jest.fn() }));
jest.mock("@/services/careerInformeService", () => ({ getCareerInformeBlob: jest.fn() }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const mockApi = apiClientModule.apiRequest as jest.Mock;

// Audit D14: the "MIL" downloads were the raw LIA API JSON. They are now CSVs with named subtests.
describe("School-admin MIL reports", () => {
  let blobs: Blob[];
  beforeEach(() => {
    blobs = [];
    (URL as any).createObjectURL = jest.fn((b: Blob) => { blobs.push(b); return "blob:x"; });
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mockApi.mockImplementation((url: string) => Promise.resolve(url.includes("/reports/lia/")
      ? { data: { cognitiveProfile: { PatternRecognition: 80, VerbalReasoning: 60, WorkingMemory: 0, NumericVelocity: 0, VisualRotation: 0 }, overallScore: 70 } }
      : { data: { examResults: [{ examType: "PatternRecognition", status: "completed", scorePercentage: 80, correctAnswers: 8, incorrectAnswers: 2, totalQuestions: 10 }] } }));
  });

  it("downloads the profile and exam history as readable CSV, not JSON", async () => {
    render(<StudentReportPanel student={{ id: "s1", name: "Ana Pérez", email: "a@x.test" } as any} type="mil" />);
    const buttons = await screen.findAllByRole("button", { name: /Download/ });
    expect(screen.queryByText("JSON")).not.toBeInTheDocument();
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(blobs).toHaveLength(2));
    const read = (b: Blob) => new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });
    const [profile, history] = await Promise.all(blobs.map(read));
    expect(blobs[0].type).toContain("text/csv");
    expect(profile).toContain("Pattern Recognition,80");
    expect(profile).not.toContain("cognitiveProfile");
    expect(history).toContain("Pattern Recognition,Completed,80,8,2,10");
  });
});
