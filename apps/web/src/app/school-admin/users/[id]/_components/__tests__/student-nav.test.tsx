/**
 * Student page: Students › Name, and previous / next through the list it was opened from,
 * keeping the list's filters and the open tab.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudentNav } from "../student-nav";
import * as recordService from "@/services/studentRecordService";

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
let mockParams = new URLSearchParams();
jest.mock("next/navigation", () => ({ useSearchParams: () => mockParams }));
jest.mock("@/services/studentRecordService", () => ({ getStudentNeighbors: jest.fn() }));

const svc = recordService as jest.Mocked<typeof recordService>;

function renderNav(tab = "record") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StudentNav studentId="s2" studentName="Bruno Díaz" tab={tab} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = "en";
  mockParams = new URLSearchParams("grade=10&state=in_progress&page=2&tab=record");
});

it("previous / next keep the list's filters and the open tab; Students goes back to that list", async () => {
  svc.getStudentNeighbors.mockResolvedValue({
    position: 2, total: 3, prev: { id: "s1", name: "Ana" }, next: { id: "s3", name: "Carla" },
  });
  renderNav("notes");
  const next = await screen.findByRole("link", { name: /Next/ });
  expect(next).toHaveAttribute("href", "/school-admin/users/s3?grade=10&state=in_progress&page=2&tab=notes");
  expect(next).toHaveAttribute("title", "Next: Carla");
  expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute(
    "href", "/school-admin/users/s1?grade=10&state=in_progress&page=2&tab=notes",
  );
  expect(screen.getByText("2 of 3")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Students" })).toHaveAttribute(
    "href", "/school-admin/students?grade=10&state=in_progress&page=2",
  );
  expect(screen.getByText("Bruno Díaz")).toHaveAttribute("aria-current", "page");
  // previous / next ask in the same filters, without the page
  expect(svc.getStudentNeighbors).toHaveBeenCalledWith("s2", expect.objectContaining({ grade: "10", state: "in_progress" }));
});

it("the first student has no previous", async () => {
  svc.getStudentNeighbors.mockResolvedValue({ position: 1, total: 3, prev: null, next: { id: "s3", name: "Carla" } });
  renderNav();
  const prev = await screen.findByRole("link", { name: /Previous/ });
  expect(prev).toHaveAttribute("aria-disabled", "true");
  expect(prev).toHaveAttribute("tabindex", "-1");
});

it("a student not in the list (filters changed) shows the breadcrumb but no previous / next", async () => {
  svc.getStudentNeighbors.mockResolvedValue({ position: null, total: 3, prev: null, next: null });
  renderNav();
  expect(await screen.findByRole("link", { name: "Students" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Next/ })).not.toBeInTheDocument();
});

it("no school list (a Super Admin viewing one student with no school open): just the name", async () => {
  svc.getStudentNeighbors.mockRejectedValue(new Error("400 No school"));
  renderNav();
  expect(await screen.findByText("Bruno Díaz")).toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByRole("link", { name: "Students" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Next/ })).not.toBeInTheDocument();
});

it("Spanish", async () => {
  mockLang = "es";
  svc.getStudentNeighbors.mockResolvedValue({ position: 2, total: 3, prev: { id: "s1", name: "Ana" }, next: { id: "s3", name: "Carla" } });
  renderNav();
  expect(await screen.findByRole("link", { name: /Siguiente/ })).toBeInTheDocument();
  expect(screen.getByText("2 de 3")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Estudiantes" })).toBeInTheDocument();
});
