import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { VocationalReport, resetVocationalReportCache } from "../VocationalReport";
import * as svc from "@/services/vocationalReportService";

// Real i18next over the shipped common.json, so assertions check rendered copy.
let mockLang: "en" | "es" = "en";
jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const insts = { en: createTestI18n("en"), es: createTestI18n("es") };
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: () => ({ t: insts[mockLang].t.bind(insts[mockLang]), i18n: insts[mockLang] }),
  };
});
beforeEach(() => { mockLang = "en"; });

jest.mock("next/navigation", () => ({ usePathname: () => "/dashboard/assessments/vocational" }));
jest.mock("@/services/vocationalReportService");
const r360 = svc.recompute360 as jest.Mock;
const rInt = svc.recomputeIntegrated as jest.Mock;
const namesEn = svc.getDimensionNamesEn as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); resetVocationalReportCache(); });

const readyScore = { status: "ready", composite: 80, band: "strong", respondentCount: 2, groupsIncluded: ["self", "parent"],
  dimensionScores: [{ key: "d1", nameEs: "Intereses", score: 75, band: "moderateHigh", byGroup: { self: 80 } }],
  rankings: { interests: [{ value: "ing", points: 20 }], industries: [], workType: null, openInsights: [] } };

it("recomputes 360 before integrated, then renders", async () => {
  const order: string[] = [];
  r360.mockImplementation(async () => { order.push("360"); return readyScore; });
  rInt.mockImplementation(async () => { order.push("int"); return { status: "ready", integratedComposite: 84.1, band: "strong", threeSixtyScore: 80, pcaScore: 90, milScore: 80, weightsApplied: { threeSixty: 0.4, pca: 0.3, mil: 0.3 } }; });
  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText(/84.1/)).toBeInTheDocument());
  expect(order).toEqual(["360", "int"]);
  expect(screen.getByText("Intereses")).toBeInTheDocument();
});

it("renders dimensions but no integrated headline when integration not_ready", async () => {
  r360.mockResolvedValue(readyScore);
  rInt.mockResolvedValue({ status: "not_ready", missing: ["mil"] });
  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText("Intereses")).toBeInTheDocument());
  expect(screen.getAllByText(/unlock|complete/i).length).toBeGreaterThan(0);
});

it("shows English dimension names from the instrument catalog for an English UI", async () => {
  r360.mockResolvedValue(readyScore);
  rInt.mockResolvedValue({ status: "not_ready", missing: ["mil"] });
  namesEn.mockResolvedValue({ d1: "Academic interests" });
  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText("Academic interests")).toBeInTheDocument());
});

it("keeps Spanish dimension names for a Spanish UI (catalog not needed)", async () => {
  mockLang = "es";
  r360.mockResolvedValue(readyScore);
  rInt.mockResolvedValue({ status: "not_ready", missing: ["mil"] });
  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText("Intereses")).toBeInTheDocument());
  expect(namesEn).not.toHaveBeenCalled();
});

it("keeps Spanish names when the catalog lookup fails", async () => {
  r360.mockResolvedValue(readyScore);
  rInt.mockResolvedValue({ status: "not_ready", missing: ["mil"] });
  namesEn.mockRejectedValue(new Error("nope"));
  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText("Intereses")).toBeInTheDocument());
});

it("shows an error state with retry when recompute throws", async () => {
  r360.mockRejectedValue(new Error("boom"));
  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getAllByText(/couldn't load|error|try again/i).length).toBeGreaterThan(0));
});

it("renders the report chrome in Spanish", async () => {
  mockLang = "es";
  r360.mockResolvedValue(readyScore);
  rInt.mockResolvedValue({ status: "not_ready", missing: ["mil"] });
  render(<VocationalReport evaluatedUserId="stu1" selfView />);
  await waitFor(() => expect(screen.getByText("Mi informe vocacional 360")).toBeInTheDocument());
  expect(screen.getByText("Dimensiones")).toBeInTheDocument();
  expect(screen.getByText(/Moderadamente alto/)).toBeInTheDocument();
  expect(screen.queryByText(/Vocational 360 Report|Dimensions|moderateHigh/)).not.toBeInTheDocument();
});

// audit 2026-10-09 C18: paywall ON + no paid results → the API answers 402; show the unlock state, not "try again".
it("shows the 'unlock your results' state on a 402 instead of the load error", async () => {
  r360.mockRejectedValue(Object.assign(new Error("Your full results unlock after your first payment"), {
    status: 402, data: { success: false, code: "PAID_RESULTS_REQUIRED" },
  }));
  render(<VocationalReport evaluatedUserId="stu1" selfView />);
  await waitFor(() => expect(screen.getByText("Unlock your results")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "Unlock my results" })).toHaveAttribute(
    "href", "/complete-purchase?returnTo=%2Fdashboard%2Fassessments%2Fvocational",
  );
  expect(rInt).not.toHaveBeenCalled();
});

it("does not recompute again when the same report is reopened, but Refresh does (audit F)", async () => {
  r360.mockResolvedValue(readyScore);
  rInt.mockResolvedValue({ status: "not_ready", missing: ["mil"] });
  const first = render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText("Intereses")).toBeInTheDocument());
  first.unmount();

  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText("Intereses")).toBeInTheDocument());
  expect(r360).toHaveBeenCalledTimes(1);
  expect(rInt).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
  await waitFor(() => expect(r360).toHaveBeenCalledTimes(2));
  expect(rInt).toHaveBeenCalledTimes(2);
});

it("does not cache a failure: reopening after an error asks again", async () => {
  r360.mockRejectedValueOnce(new Error("500"));
  const first = render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  first.unmount();
  r360.mockResolvedValue(readyScore);
  rInt.mockResolvedValue({ status: "not_ready", missing: ["mil"] });
  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText("Intereses")).toBeInTheDocument());
  expect(r360).toHaveBeenCalledTimes(2);
});
