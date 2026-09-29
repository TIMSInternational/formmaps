import { render, screen } from "@testing-library/react";
import { IntegratedHeadline } from "../_components/IntegratedHeadline";

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

it("renders the composite + component bars when ready", () => {
  render(<IntegratedHeadline integrated={{ status: "ready", integratedComposite: 84.1, band: "strong", threeSixtyScore: 87.8, pcaScore: 83.3, milScore: 80, weightsApplied: { threeSixty: 0.4, pca: 0.3, mil: 0.3 } }} />);
  expect(screen.getByText(/84.1/)).toBeInTheDocument();
  expect(screen.getByText(/strong/i)).toBeInTheDocument();
  expect(screen.getByText(/360/)).toBeInTheDocument();
});

it("renders an unlock note when not ready", () => {
  render(<IntegratedHeadline integrated={{ status: "not_ready", missing: ["mil"] }} />);
  expect(screen.getByText(/unlock|complete/i)).toBeInTheDocument();
  expect(screen.queryByText(/84.1/)).not.toBeInTheDocument();
});
