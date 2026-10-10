/**
 * audit 2026-10-09 C18 — with the student paywall ON, results endpoints answer
 * 402 PAID_RESULTS_REQUIRED. The results pages used to render "you have not
 * completed this assessment" and link back to the test (a loop for a student
 * who had finished it); they now show a translated "unlock your results" state
 * whose CTA goes to the purchase page with a return URL.
 */
import { render, screen, waitFor } from "@testing-library/react";
import LIAResultsPage from "@/app/dashboard/assessments/lia/results/page";
import PersonalityResultsPage from "@/app/dashboard/assessments/personality/results/page";
import { liaAssessmentApi } from "@/services/liaService";
import { getMILResults } from "@/services/milService";
import { personalityApi } from "@/services/personalityService";

let mockLang: "en" | "es" = "en";
let mockPathname = "/dashboard/assessments/lia/results";
jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const insts = { en: createTestI18n("en"), es: createTestI18n("es") };
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: () => ({ t: insts[mockLang].t.bind(insts[mockLang]), i18n: insts[mockLang] }),
  };
});
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => mockPathname,
}));
jest.mock("next/dynamic", () => () => () => null);
jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: new Proxy({}, { get: () => ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children) }),
  };
});
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({ language: "english", user: { id: "u1", name: "Test Student", email: "t@x.dev" } }),
}));
jest.mock("@/lib/i18n/contentLanguage", () => ({ useContentLanguage: () => "en" }));
jest.mock("@/services/liaService", () => ({ liaAssessmentApi: { getUserResults: jest.fn() }, SUBTEST_ORDER: [] }));
jest.mock("@/services/milService", () => ({ getMILResults: jest.fn() }));
jest.mock("@/services/personalityService", () => ({ personalityApi: { getUserResults: jest.fn() } }));
jest.mock("@/data/liaReportContent", () => ({ SUBTEST_DESCRIPTIONS: {} }));
jest.mock("@/components/reports/buildLIAReportData", () => ({ buildLIAReportData: () => ({}) }));
jest.mock("../lia/_tims/ResultsReport", () => ({ ResultsReport: () => <div>parity report</div> }));

// The shape the apiClient interceptor rejects with for a paywall 402 (both backends send this body).
const paywall402 = () =>
  Object.assign(new Error("Your full results unlock after your first payment"), {
    status: 402,
    data: { success: false, message: "Your full results unlock after your first payment", code: "PAID_RESULTS_REQUIRED" },
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = "en";
});

describe("LIA results page", () => {
  beforeEach(() => { mockPathname = "/dashboard/assessments/lia/results"; });

  it("shows 'unlock your results' (not 'not completed') on a 402, with a return URL to this page", async () => {
    (liaAssessmentApi.getUserResults as jest.Mock).mockRejectedValue(paywall402());
    render(<LIAResultsPage />);
    await waitFor(() => expect(screen.getByText("Unlock your results")).toBeInTheDocument());
    expect(screen.queryByText("No Results")).not.toBeInTheDocument();
    expect(screen.queryByText(/not completed/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Unlock my results" })).toHaveAttribute(
      "href",
      "/complete-purchase?returnTo=%2Fdashboard%2Fassessments%2Flia%2Fresults",
    );
    expect(getMILResults).not.toHaveBeenCalled();
  });

  it("is translated for a Spanish UI", async () => {
    mockLang = "es";
    (liaAssessmentApi.getUserResults as jest.Mock).mockRejectedValue(paywall402());
    render(<LIAResultsPage />);
    await waitFor(() => expect(screen.getByText("Desbloquea tus resultados")).toBeInTheDocument());
  });

  it("still shows No Results for a non-402 failure", async () => {
    (liaAssessmentApi.getUserResults as jest.Mock).mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    render(<LIAResultsPage />);
    await waitFor(() => expect(screen.getByText("No Results")).toBeInTheDocument());
    expect(screen.queryByText("Unlock your results")).not.toBeInTheDocument();
  });
});

describe("Personality results page", () => {
  beforeEach(() => { mockPathname = "/dashboard/assessments/personality/results"; });

  it("shows 'unlock your results' on a 402 instead of 'no results'", async () => {
    (personalityApi.getUserResults as jest.Mock).mockRejectedValue(paywall402());
    render(<PersonalityResultsPage />);
    await waitFor(() => expect(screen.getByText("Unlock your results")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Unlock my results" })).toHaveAttribute(
      "href",
      "/complete-purchase?returnTo=%2Fdashboard%2Fassessments%2Fpersonality%2Fresults",
    );
  });

  it("keeps the no-results state for a genuine failure", async () => {
    (personalityApi.getUserResults as jest.Mock).mockRejectedValue(Object.assign(new Error("nf"), { status: 404 }));
    render(<PersonalityResultsPage />);
    await waitFor(() => expect(screen.queryByText("Unlock your results")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button")).toBeInTheDocument());
  });
});
