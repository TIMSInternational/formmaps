import { render, screen, fireEvent } from "@testing-library/react";
import { DimensionBreakdown } from "../_components/DimensionBreakdown";
import type { DimensionScore } from "@/services/vocationalReportService";

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

const dims = [
  { key: "intereses", nameEs: "Intereses Académicos", score: 75, band: "moderateHigh", byGroup: { self: 80, parent: 70 } },
  { key: "habilidades", nameEs: "Habilidades", score: null, band: null, byGroup: {} as Record<string, number> },
] satisfies DimensionScore[];

it("renders each dimension with its score and band", () => {
  render(<DimensionBreakdown dimensions={dims} />);
  expect(screen.getByText("Intereses Académicos")).toBeInTheDocument();
  expect(screen.getByText(/75/)).toBeInTheDocument();
  expect(screen.getByText(/no responses/i)).toBeInTheDocument(); // null-score dim
});

it("shows the English name for an English UI and the Spanish name for a Spanish UI", () => {
  const withEn = [{ ...dims[0], nameEn: "Academic interests" }, dims[1]];
  const { unmount } = render(<DimensionBreakdown dimensions={withEn} />);
  expect(screen.getByText("Academic interests")).toBeInTheDocument();
  expect(screen.getByText("Habilidades")).toBeInTheDocument();   // no English → Spanish
  unmount();
  mockLang = "es";
  render(<DimensionBreakdown dimensions={withEn} />);
  expect(screen.getByText("Intereses Académicos")).toBeInTheDocument();
  expect(screen.queryByText("Academic interests")).not.toBeInTheDocument();
});

it("expands a dimension to show per-group breakdown", () => {
  render(<DimensionBreakdown dimensions={dims} />);
  fireEvent.click(screen.getByRole("button", { name: /Intereses Académicos/i }));
  expect(screen.getByText(/self/i)).toBeInTheDocument();
  expect(screen.getByText(/parent/i)).toBeInTheDocument();
});
