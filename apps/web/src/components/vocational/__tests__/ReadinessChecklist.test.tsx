import { render, screen } from "@testing-library/react";
import { ReadinessChecklist } from "../_components/ReadinessChecklist";

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

it("marks 360 ready and PCA/LIA missing, naming instruments like every other surface (#398)", () => {
  render(<ReadinessChecklist
    score={{ status: "ready", composite: 80, band: "strong", respondentCount: 2, groupsIncluded: ["self", "parent"], dimensionScores: [], rankings: { interests: [], industries: [], workType: null, openInsights: [] } }}
    integrated={{ status: "not_ready", missing: ["pca", "mil"] }} />);
  expect(screen.getByText(/360/)).toBeInTheDocument();
  expect(screen.getByText("PCA Assessment")).toBeInTheDocument();
  expect(screen.getByText("LIA Assessment")).toBeInTheDocument();
  expect(screen.queryByText(/MIL/)).toBeNull();
  // 360 row shows a ready indicator (aria-label or text)
  expect(screen.getByLabelText(/360° Evaluation ready/i)).toBeInTheDocument();
});

it("never_computed integrated → PCA and LIA are NOT ready even when 360 is ready", () => {
  render(<ReadinessChecklist
    score={{ status: "ready", composite: 80, band: "strong", respondentCount: 2, groupsIncluded: ["self", "parent"], dimensionScores: [], rankings: { interests: [], industries: [], workType: null, openInsights: [] } }}
    integrated={{ status: "never_computed" }} />);
  // PCA and LIA rows render the pending (not-ready) indicator
  expect(screen.getByLabelText(/PCA.*pending/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/LIA.*pending/i)).toBeInTheDocument();
  // 360 itself is still ready
  expect(screen.getByLabelText(/360° Evaluation ready/i)).toBeInTheDocument();
});

it("renders the checklist in Spanish", () => {
  mockLang = "es";
  render(<ReadinessChecklist
    score={{ status: "ready", composite: 80, band: "strong", respondentCount: 2, groupsIncluded: ["self", "parent"], dimensionScores: [], rankings: { interests: [], industries: [], workType: null, openInsights: [] } }}
    integrated={{ status: "not_ready", missing: ["pca", "mil"] }} />);
  expect(screen.getByText("Estado de las evaluaciones")).toBeInTheDocument();
  expect(screen.getByText("Completa la evaluación PCA.")).toBeInTheDocument();
  expect(screen.getByLabelText("Evaluación 360°: lista")).toBeInTheDocument();
  expect(screen.queryByText(/Assessment readiness|Complete the/)).not.toBeInTheDocument();
});
