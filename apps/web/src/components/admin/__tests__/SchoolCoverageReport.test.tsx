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
  expect(open.textContent).toMatch(/8\s*0\s*3\s*0\s*5$/); // students, via school, own subscription, own free access (E5), none
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

// audit 2026-10-09 E5 — complimentary access in the coverage report.
it("shows a school's complimentary coverage and students on their own free access", async () => {
  const r = report(1, 1);
  r.data = [
    {
      ...r.data[0], id: "s-comp", name: "Comp School", status: "invited", covered: true, reason: "complimentary",
      contractStartDate: null, contractEndDate: null,
      complimentaryUntil: "2026-11-09T15:00:00.000Z", students: 4, coveredBySchool: 4, coveredByComplimentary: 0,
    } as never,
    { ...r.data[1], coveredBySubscription: 1, coveredByComplimentary: 2, notCovered: 5 } as never,
  ];
  mockGet.mockResolvedValue(r);
  render(<SchoolCoverageReport />);

  const comp = await screen.findByTestId("coverage-row-s-comp");
  expect(comp).toHaveTextContent("Complimentary access (free)");
  expect(comp).toHaveTextContent(`Complimentary until ${new Date("2026-11-09T15:00:00.000Z").toLocaleDateString()}`);
  expect(screen.getByRole("columnheader", { name: "Own free access" })).toBeInTheDocument();
  const cells = screen.getByTestId("coverage-row-s-2").querySelectorAll("td");
  expect(Array.from(cells).slice(-3).map((c) => c.textContent)).toEqual(["1", "2", "5"]);
});
