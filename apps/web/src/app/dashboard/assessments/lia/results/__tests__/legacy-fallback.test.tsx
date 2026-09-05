// A student whose MIL predates the parity LIA engine has no lia_assessment_session:
// /lia/user/{id}/results is 404 while /mil/results (legacy fallback) says 5/5 complete —
// and the assessments page, which reads the latter, links "View Results" here. This page
// used to show "you have not completed the LIA" to exactly that student.
import { render, screen, waitFor } from "@testing-library/react";
import LIAResultsPage from "@/app/dashboard/assessments/lia/results/page";
import { liaAssessmentApi } from "@/services/liaService";
import { getMILResults } from "@/services/milService";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("next/dynamic", () => () => () => null);
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({ language: "english", user: { id: "u1", name: "Test Student", email: "t@x.dev" } }),
}));
jest.mock("@/services/liaService", () => ({
  liaAssessmentApi: { getUserResults: jest.fn() },
  SUBTEST_ORDER: [],
}));
jest.mock("@/services/milService", () => ({ getMILResults: jest.fn() }));
jest.mock("@/data/liaReportContent", () => ({ SUBTEST_DESCRIPTIONS: {} }));
jest.mock("@/components/reports/buildLIAReportData", () => ({ buildLIAReportData: () => ({}) }));
jest.mock("../../_tims/ResultsReport", () => ({ ResultsReport: () => <div>parity report</div> }));

const mockParity = liaAssessmentApi.getUserResults as jest.Mock;
const mockMil = getMILResults as jest.Mock;
const notFound = () => Object.assign(new Error("Not found"), { status: 404 });

beforeEach(() => jest.clearAllMocks());

it("renders the legacy scores when parity is 404 and mil/results is complete", async () => {
  mockParity.mockRejectedValue(notFound());
  mockMil.mockResolvedValue({
    userId: "u1", overallScore: 80, overallPercentile: 0, completedExams: 5, totalExams: 5,
    lastCompletedAt: "2026-06-26T18:11:39.423Z",
    examResults: [
      { examId: "e1", examName: "Pattern Recognition", status: "completed", scorePercentage: 75, correctAnswers: 15, incorrectAnswers: 5, totalQuestions: 20 },
      { examId: "e2", examName: "Verbal Reasoning", status: "completed", scorePercentage: 80, correctAnswers: 16, incorrectAnswers: 4, totalQuestions: 20 },
    ],
  });
  render(<LIAResultsPage />);
  await waitFor(() => expect(screen.getByText("LIA Assessment Results")).toBeInTheDocument());
  expect(screen.getAllByText("80%")).toHaveLength(2); // overall average + Verbal Reasoning
  expect(screen.getByText("75%")).toBeInTheDocument();
  expect(screen.getByText("Pattern Recognition")).toBeInTheDocument();
  expect(screen.getByText(/not norm-referenced percentiles/)).toBeInTheDocument();
  expect(screen.queryByText("No Results")).not.toBeInTheDocument();
});

it("still shows No Results when parity is 404 and the legacy data is incomplete", async () => {
  mockParity.mockRejectedValue(notFound());
  mockMil.mockResolvedValue({ userId: "u1", overallScore: 0, overallPercentile: 0, completedExams: 2, totalExams: 5, lastCompletedAt: null, examResults: [] });
  render(<LIAResultsPage />);
  await waitFor(() => expect(screen.getByText("No Results")).toBeInTheDocument());
});

it("does not consult legacy data on a non-404 failure", async () => {
  mockParity.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
  render(<LIAResultsPage />);
  await waitFor(() => expect(screen.getByText("No Results")).toBeInTheDocument());
  expect(mockMil).not.toHaveBeenCalled();
});

it("prefers the parity report when it exists", async () => {
  mockParity.mockResolvedValue({ global_percentile: 70, percentiles: {}, response_counts: {} });
  render(<LIAResultsPage />);
  await waitFor(() => expect(screen.getByText("parity report")).toBeInTheDocument());
  expect(mockMil).not.toHaveBeenCalled();
});
