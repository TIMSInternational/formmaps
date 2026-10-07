/**
 * Student detail → "Results & Answers": reports, every assessment in a fixed order, and each
 * assessment's questions with the student's answers.
 */
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordTab } from "../record-tab";
import * as recordService from "@/services/studentRecordService";
import { getCareerInformeBlob } from "@/services/careerInformeService";
import { getPcaReportBlob } from "@/services/pcaImageService";
import type { StudentRecord, AssessmentAnswers } from "@/services/studentRecordService";

let mockLang: "en" | "es" = "en";
jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const insts: Record<string, ReturnType<typeof createTestI18n>> = {};
  const get = (l: "en" | "es") => (insts[l] ??= createTestI18n(l));
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: (ns?: string) => {
      const inst = get(mockLang);
      return { t: inst.getFixedT(null, ns ?? "common"), i18n: inst };
    },
  };
});
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/services/studentRecordService", () => ({
  getStudentRecord: jest.fn(),
  getAssessmentAnswers: jest.fn(),
  getAssessmentAnswersPdfBlob: jest.fn(),
  getStudentRecordPdfBlob: jest.fn(),
  saveBlob: jest.fn(),
}));
jest.mock("@/services/careerInformeService", () => ({ getCareerInformeBlob: jest.fn() }));
jest.mock("@/services/pcaImageService", () => ({ getPcaReportBlob: jest.fn() }));

const svc = recordService as jest.Mocked<typeof recordService>;
const blob = new Blob(["pdf"], { type: "application/pdf" });

const none = { available: false, reason: null, count: 0 };
// Deliberately out of display order: the tab must sort them.
const RECORD: StudentRecord = {
  student: { id: "stu-1", name: "Ana Pérez", email: "ana@example.com", gradeLevel: "11", schoolName: "Academy" },
  generatedAt: "2026-10-07T00:00:00Z",
  reports: [
    { key: "career_informe", title: "Career guidance report", available: true, reason: null },
    { key: "pca_pca", title: "PCA report", available: true, reason: null, pcaCod: "777" },
    { key: "pca_gd", title: "Development guide", available: false, reason: "PCA not completed yet" },
    { key: "pca_coaching", title: "Coaching report", available: false, reason: "PCA not completed yet" },
  ],
  assessments: [
    { key: "careerfit", title: "CareerFit", status: "not_started", completedAt: null, summary: [], answers: { ...none, reason: "Not started" } },
    { key: "mil", title: "MIL", status: "completed", completedAt: "2026-09-01T12:00:00Z", summary: [{ label: "Score", value: "82%" }], answers: { available: true, reason: null, count: 3 } },
    { key: "lia", title: "LIA", status: "in_progress", completedAt: null, summary: [], answers: { ...none, reason: "Answers are not stored for LIA" } },
    { key: "integrated", title: "Integrated", status: "not_started", completedAt: null, summary: [], answers: none },
    { key: "personality", title: "Personality", status: "completed", completedAt: "2026-08-01T12:00:00Z", summary: [{ label: "Type", value: "INTJ" }], answers: { available: true, reason: null, count: 2 } },
    { key: "pca", title: "PCA/DISC", status: "completed", completedAt: null, summary: [], answers: none },
    { key: "vocational360", title: "Vocational 360", status: "not_started", completedAt: null, summary: [], answers: none },
    { key: "eval360", title: "360 evaluation", status: "not_started", completedAt: null, summary: [], answers: none },
  ],
};

const MIL_ANSWERS: AssessmentAnswers = {
  key: "mil", title: "MIL", completedAt: "2026-09-01T12:00:00Z",
  sections: [
    { title: "Verbal", subtitle: "Exam 1", rows: [
      { n: 1, question: "Synonym of happy", options: ["glad", "sad"], answer: "glad", correctAnswer: "glad", isCorrect: true, comment: null, meta: null },
      { n: 2, question: "Antonym of hot", options: ["cold", "warm"], answer: "warm", correctAnswer: "cold", isCorrect: false, comment: null, meta: "12s" },
    ] },
    { title: "Numeric", subtitle: null, rows: [
      { n: 3, question: "2 + 2", options: null, answer: "5", correctAnswer: "4", isCorrect: false, comment: null, meta: null },
    ] },
  ],
};
const PERSONALITY_ANSWERS: AssessmentAnswers = {
  key: "personality", title: "Personality", completedAt: null,
  sections: [{ title: "Part 1", subtitle: null, rows: [
    { n: 1, question: "I enjoy parties", options: null, answer: "Agree", correctAnswer: null, isCorrect: null, comment: null, meta: null },
  ] }],
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RecordTab studentId="stu-1" studentName="Ana Pérez" /></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = "en";
  svc.getStudentRecord.mockResolvedValue(RECORD);
  svc.getAssessmentAnswers.mockImplementation(async (_id, key) => (key === "mil" ? MIL_ANSWERS : PERSONALITY_ANSWERS));
  svc.getAssessmentAnswersPdfBlob.mockResolvedValue(blob);
  svc.getStudentRecordPdfBlob.mockResolvedValue(blob);
  (getCareerInformeBlob as jest.Mock).mockResolvedValue(blob);
  (getPcaReportBlob as jest.Mock).mockResolvedValue(blob);
});

it("shows the reports and all 8 assessments in the fixed order, with unavailable reasons", async () => {
  renderTab();
  await screen.findByText("Reports");
  expect(svc.getStudentRecord).toHaveBeenCalledWith("stu-1", "en");

  const cards = screen.getAllByTestId(/^record-assessment-/).map((el) => el.getAttribute("data-testid"));
  expect(cards).toEqual(["lia", "personality", "eval360", "vocational360", "mil", "pca", "integrated", "careerfit"].map((k) => `record-assessment-${k}`));

  const mil = screen.getByTestId("record-assessment-mil");
  expect(within(mil).getByText("Completed")).toBeInTheDocument();
  expect(within(mil).getByText("82%")).toBeInTheDocument();
  expect(within(mil).getByRole("button", { name: /View answers \(3\)/ })).toBeInTheDocument();
  expect(within(mil).getByRole("button", { name: /Download PDF/ })).toBeInTheDocument();

  const lia = screen.getByTestId("record-assessment-lia");
  expect(within(lia).getByText("In progress")).toBeInTheDocument();
  expect(within(lia).getByText("Answers are not stored for LIA")).toBeInTheDocument();
  expect(within(lia).queryByRole("button", { name: /View answers/ })).not.toBeInTheDocument();
  expect(within(screen.getByTestId("record-assessment-integrated")).getByText("Answers are not available.")).toBeInTheDocument();

  // Unavailable reports are disabled and say why; the career informe offers both languages.
  expect(screen.getByRole("button", { name: "Development guide" })).toBeDisabled();
  expect(screen.getAllByText("PCA not completed yet").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "Career guidance report ES" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Career guidance report EN" })).toBeEnabled();
});

it("View answers lazy-loads the sections, with correct-answer and ✓/✗ columns", async () => {
  renderTab();
  const mil = await screen.findByTestId("record-assessment-mil");
  expect(svc.getAssessmentAnswers).not.toHaveBeenCalled();
  fireEvent.click(within(mil).getByRole("button", { name: /View answers/ }));

  await within(mil).findByText("Synonym of happy");
  expect(svc.getAssessmentAnswers).toHaveBeenCalledWith("stu-1", "mil", "en");
  expect(within(mil).getByRole("heading", { name: "Verbal" })).toBeInTheDocument();
  expect(within(mil).getByText("Exam 1")).toBeInTheDocument();
  expect(within(mil).getAllByRole("columnheader", { name: "Correct answer" }).length).toBe(2);
  expect(within(mil).getAllByText("Correct", { selector: ".sr-only" })).toHaveLength(1);
  expect(within(mil).getAllByText("Incorrect", { selector: ".sr-only" })).toHaveLength(2);
  expect(within(mil).getByText("12s")).toBeInTheDocument();
  expect(within(mil).getByText("sad")).toBeInTheDocument(); // options listed under the question
});

it("omits the correct-answer and result columns when the data has none", async () => {
  renderTab();
  const p = await screen.findByTestId("record-assessment-personality");
  fireEvent.click(within(p).getByRole("button", { name: /View answers/ }));
  await within(p).findByText("I enjoy parties");
  expect(within(p).queryByRole("columnheader", { name: "Correct answer" })).not.toBeInTheDocument();
  expect(within(p).queryByRole("columnheader", { name: "Result" })).not.toBeInTheDocument();
  expect(within(p).queryByLabelText("Only incorrect")).not.toBeInTheDocument();
});

it("search and 'Only incorrect' filter the rows", async () => {
  renderTab();
  const mil = await screen.findByTestId("record-assessment-mil");
  fireEvent.click(within(mil).getByRole("button", { name: /View answers/ }));
  await within(mil).findByText("Synonym of happy");

  fireEvent.change(within(mil).getByLabelText("Search answers"), { target: { value: "antonym" } });
  expect(within(mil).queryByText("Synonym of happy")).not.toBeInTheDocument();
  expect(within(mil).getByText("Antonym of hot")).toBeInTheDocument();
  expect(within(mil).queryByText("Numeric")).not.toBeInTheDocument();

  fireEvent.change(within(mil).getByLabelText("Search answers"), { target: { value: "zzz" } });
  expect(within(mil).getByText("No questions match your filters.")).toBeInTheDocument();

  fireEvent.change(within(mil).getByLabelText("Search answers"), { target: { value: "" } });
  fireEvent.click(within(mil).getByLabelText("Only incorrect"));
  expect(within(mil).queryByText("Synonym of happy")).not.toBeInTheDocument();
  expect(within(mil).getByText("Antonym of hot")).toBeInTheDocument();
  expect(within(mil).getByText("2 + 2")).toBeInTheDocument();
});

it("downloads call the right service with the selected language", async () => {
  renderTab();
  await screen.findByText("Reports");

  fireEvent.click(screen.getByRole("button", { name: /Download complete record/ }));
  await waitFor(() => expect(svc.getStudentRecordPdfBlob).toHaveBeenCalledWith("stu-1", "en"));

  fireEvent.click(screen.getByRole("button", { name: "Career guidance report ES" }));
  await waitFor(() => expect(getCareerInformeBlob).toHaveBeenCalledWith("stu-1", "es"));

  // Switch the PDF language to Spanish: applies to every download that follows.
  fireEvent.click(screen.getByRole("button", { name: "Spanish" }));
  await waitFor(() => expect(svc.getStudentRecord).toHaveBeenCalledWith("stu-1", "es"));

  fireEvent.click(await screen.findByRole("button", { name: "PCA report" }));
  await waitFor(() => expect(getPcaReportBlob).toHaveBeenCalledWith("777", "pca", "es"));

  const mil = screen.getByTestId("record-assessment-mil");
  fireEvent.click(within(mil).getByRole("button", { name: /Download PDF/ }));
  await waitFor(() => expect(svc.getAssessmentAnswersPdfBlob).toHaveBeenCalledWith("stu-1", "mil", "es"));
  await waitFor(() => expect(svc.saveBlob).toHaveBeenCalledTimes(4));
});

it("defaults to Spanish when the UI is in Spanish", async () => {
  mockLang = "es";
  renderTab();
  await screen.findByText("Informes");
  expect(svc.getStudentRecord).toHaveBeenCalledWith("stu-1", "es");
  expect(screen.getByRole("button", { name: /Descargar expediente completo/ })).toBeInTheDocument();
});

it("shows an empty state when there are no assessments", async () => {
  svc.getStudentRecord.mockResolvedValue({ ...RECORD, reports: [], assessments: [] });
  renderTab();
  expect(await screen.findByText("No assessments yet")).toBeInTheDocument();
  expect(screen.getByText("No reports are available for this student yet.")).toBeInTheDocument();
});

it("shows an error with a retry when the record fails to load", async () => {
  svc.getStudentRecord.mockRejectedValueOnce(new Error("boom"));
  renderTab();
  expect(await screen.findByText("We couldn't load this student's record.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Reports")).toBeInTheDocument();
});
