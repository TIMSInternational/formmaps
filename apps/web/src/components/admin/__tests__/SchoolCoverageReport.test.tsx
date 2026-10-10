/**
 * audit 2026-10-09 E4 — the Super Admin coverage report on the admin Schools page.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SchoolCoverageReport } from "../SchoolCoverageReport";
import { getCoverageReport } from "@/services/schoolService";

let mockLang: "en" | "es" = "en";
jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const insts = { en: createTestI18n("en"), es: createTestI18n("es") };
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: (ns?: string) => {
      const inst = insts[mockLang];
      return { t: inst.getFixedT(null, ns ?? "common"), i18n: inst };
    },
  };
});
jest.mock("@/services/schoolService", () => ({ getCoverageReport: jest.fn() }));

const mockGet = getCoverageReport as jest.Mock;

const report = (page = 1, totalPages = 2) => ({
  success: true,
  page,
  limit: 25,
  total: 30,
  totalPages,
  paywallEnabled: false,
  generatedAt: "2026-10-09T12:00:00.000Z",
  data: [
    {
      id: "s-1", name: "Covered Academy", status: "active", isActive: true,
      contractStartDate: "2026-01-01T00:00:00.000Z", contractEndDate: "2027-06-30T00:00:00.000Z",
      timezone: "America/Bogota", covered: true, reason: "active_contract",
      students: 10, coveredBySchool: 10, coveredBySubscription: 0, notCovered: 0,
    },
    {
      id: "s-2", name: "Open Ended", status: "active", isActive: true,
      contractStartDate: null, contractEndDate: null,
      timezone: "America/Bogota", covered: false, reason: "no_end_date",
      students: 8, coveredBySchool: 0, coveredBySubscription: 3, notCovered: 5,
    },
  ],
});

beforeEach(() => {
  mockLang = "en";
  mockGet.mockReset();
});

it("shows per-school coverage, reason and student counts", async () => {
  mockGet.mockResolvedValue(report());
  render(<SchoolCoverageReport />);

  const covered = await screen.findByTestId("coverage-row-s-1");
  expect(covered).toHaveTextContent("Covered Academy");
  expect(covered).toHaveTextContent("2026-01-01 → 2027-06-30");
  expect(covered).toHaveTextContent("Active contract");

  const open = screen.getByTestId("coverage-row-s-2");
  expect(open).toHaveTextContent("Not covered");
  expect(open).toHaveTextContent("No contract end date");
  expect(open.textContent).toMatch(/8\s*0\s*3\s*5$/);
  expect(screen.getByTestId("coverage-paywall")).toHaveTextContent("Student paywall is OFF");
  expect(mockGet).toHaveBeenCalledWith({ page: 1, limit: 25 });
});

it("pages through the report", async () => {
  mockGet.mockImplementation(async ({ page }: { page: number }) => report(page));
  render(<SchoolCoverageReport />);
  await screen.findByTestId("coverage-row-s-1");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith({ page: 2, limit: 25 }));
});

it("renders in Spanish", async () => {
  mockLang = "es";
  mockGet.mockResolvedValue(report());
  render(<SchoolCoverageReport />);
  expect(await screen.findByText("Cobertura de estudiantes")).toBeInTheDocument();
  expect(screen.getByTestId("coverage-row-s-2")).toHaveTextContent("Sin fecha de fin de contrato");
});

it("shows an error when the report cannot load", async () => {
  mockGet.mockRejectedValue(new Error("403"));
  render(<SchoolCoverageReport />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the coverage report.");
});
