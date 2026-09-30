import { render, screen } from "@testing-library/react";
import { RankingsPanel } from "../_components/RankingsPanel";

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

it("renders interests, industries, work type and open insights", () => {
  render(<RankingsPanel rankings={{
    interests: [{ value: "ingenieria", points: 19.6 }],
    industries: [{ value: "tech", count: 2 }],
    workType: { value: "independiente", count: 1 },
    openInsights: [{ group: "self", text: "Me gusta resolver problemas" }],
  }} />);
  expect(screen.getByText(/ingenieria/i)).toBeInTheDocument();
  expect(screen.getByText(/tech/i)).toBeInTheDocument();
  expect(screen.getByText(/independiente/i)).toBeInTheDocument();
  expect(screen.getByText(/Me gusta resolver problemas/i)).toBeInTheDocument();
});
