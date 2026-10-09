/**
 * Students → every student with each assessment's status. A row opens the student's
 * "Results & Answers" carrying the list's filters; filters and pages live in the URL.
 */
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudentDirectory } from "../StudentDirectory";
import * as recordService from "@/services/studentRecordService";
import type { StudentDirectory as Dir, DirectoryStudent } from "@/services/studentRecordService";

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

const replace = jest.fn();
const push = jest.fn();
let mockParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => mockParams,
}));
jest.mock("@/services/studentRecordService", () => ({
  ...jest.requireActual("@/services/studentRecordService"),
  getStudentDirectory: jest.fn(),
  getStudentDirectoryCsvBlob: jest.fn(),
  saveBlob: jest.fn(),
}));

const svc = recordService as jest.Mocked<typeof recordService>;
const ns = { status: "not_started" as const, completedAt: null, detail: null };

function student(id: string, name: string, over: Partial<DirectoryStudent["cells"]> = {}, completed = 0): DirectoryStudent {
  return {
    id, name, email: `${id}@x.test`, gradeLevel: 10, completed,
    cells: { lia: ns, personality: ns, eval360: ns, vocational360: ns, mil: ns, pca: ns, integrated: ns, ...over },
  };
}

const zero = { completed: 0, in_progress: 0, not_started: 2 };
function dir(over: Partial<Dir> = {}): Dir {
  return {
    items: [
      student("s1", "Ana Pérez", {
        personality: { status: "completed", completedAt: "2026-09-07T12:00:00Z", detail: "ESFJ" },
        mil: { status: "in_progress", completedAt: null, detail: "3/5" },
      }, 1),
      student("s2", "Bruno Díaz"),
    ],
    total: 2, page: 1, pageSize: 25, pages: 1, schoolTotal: 2, grades: [10, 11],
    summary: {
      lia: zero, personality: { completed: 1, in_progress: 0, not_started: 1 }, eval360: zero, vocational360: zero,
      mil: { completed: 0, in_progress: 1, not_started: 1 }, pca: zero, integrated: zero,
    },
    ...over,
  };
}

function renderDir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><StudentDirectory /></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = "en";
  mockParams = new URLSearchParams();
  svc.getStudentDirectory.mockResolvedValue(dir());
});

it("lists every student with a status chip per assessment and opens their results", async () => {
  renderDir();
  const rows = await screen.findAllByTestId("student-row");
  expect(rows).toHaveLength(2);
  expect(screen.getByText("2 students — open one to see every result, answer and PDF")).toBeInTheDocument();

  const ana = within(rows[0]);
  expect(ana.getByRole("img", { name: /Personality · Completed · ESFJ · completed Sep 7, 2026/ })).toBeInTheDocument();
  expect(ana.getByRole("img", { name: "MIL exams · In progress · 3/5" })).toBeInTheDocument();
  expect(ana.getByRole("img", { name: "LIA assessment · Not started" })).toBeInTheDocument();
  expect(ana.getByLabelText("1 of 7 assessments completed")).toBeInTheDocument();

  const link = ana.getByRole("link", { name: "Open Ana Pérez's results" });
  expect(link).toHaveAttribute("href", "/school-admin/users/s1?tab=record");

  fireEvent.click(rows[1]);
  expect(push).toHaveBeenCalledWith("/school-admin/users/s2?tab=record");
});

it("the student link carries the list's filters (for Back and previous / next)", async () => {
  mockParams = new URLSearchParams("grade=10&assessment=mil&state=in_progress&page=2");
  renderDir();
  expect(await screen.findByRole("link", { name: "Open Ana Pérez's results" })).toHaveAttribute(
    "href", "/school-admin/users/s1?grade=10&assessment=mil&state=in_progress&page=2&tab=record",
  );
  expect(svc.getStudentDirectory).toHaveBeenCalledWith(expect.objectContaining({ grade: "10", assessment: "mil", state: "in_progress", page: 2 }));
});

it("typing a search updates the URL once, after a pause, back on page 1", async () => {
  jest.useFakeTimers();
  try {
    mockParams = new URLSearchParams("page=3");
    renderDir();
    const box = screen.getByLabelText("Search students");
    fireEvent.change(box, { target: { value: "an" } });
    fireEvent.change(box, { target: { value: "ana " } });
    expect(replace).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(350); });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/school-admin/students?search=ana", { scroll: false });
  } finally {
    jest.useRealTimers();
  }
});

it("an assessment card filters to who hasn't started it; clicking it again clears that", async () => {
  renderDir();
  const card = await screen.findByRole("button", { name: /MIL\s*0\s*\/ 2/ });
  fireEvent.click(card);
  expect(replace).toHaveBeenLastCalledWith("/school-admin/students?assessment=mil&state=not_started", { scroll: false });

  mockParams = new URLSearchParams("assessment=mil&state=not_started");
  replace.mockClear();
  renderDir();
  const pressed = (await screen.findAllByRole("button", { pressed: true }))[0];
  fireEvent.click(pressed);
  expect(replace).toHaveBeenLastCalledWith("/school-admin/students", { scroll: false });
});

it("Clear filters keeps the sort", async () => {
  mockParams = new URLSearchParams("search=ana&grade=10&sort=progress&dir=desc");
  renderDir();
  fireEvent.click(await screen.findByRole("button", { name: "Clear filters" }));
  expect(replace).toHaveBeenLastCalledWith("/school-admin/students?sort=progress&dir=desc", { scroll: false });
});

it("pages move through the URL", async () => {
  svc.getStudentDirectory.mockResolvedValue(dir({ total: 60, pages: 3, page: 2 }));
  mockParams = new URLSearchParams("page=2");
  renderDir();
  expect(await screen.findByText("26–50 of 60")).toBeInTheDocument();
  expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Next/ }));
  expect(replace).toHaveBeenLastCalledWith("/school-admin/students?page=3", { scroll: false });
  fireEvent.click(screen.getByRole("button", { name: /Previous/ }));
  expect(replace).toHaveBeenLastCalledWith("/school-admin/students", { scroll: false });
});

it("Export CSV downloads the filtered list in the screen's language", async () => {
  mockParams = new URLSearchParams("grade=10");
  const blob = new Blob(["csv"]);
  svc.getStudentDirectoryCsvBlob.mockResolvedValue(blob);
  renderDir();
  await screen.findAllByTestId("student-row");
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() => expect(svc.saveBlob).toHaveBeenCalledWith(blob, "students-results-en.csv"));
  expect(svc.getStudentDirectoryCsvBlob).toHaveBeenCalledWith(expect.objectContaining({ grade: "10" }), "en");
});

it("a school with no students says so and points to invites", async () => {
  svc.getStudentDirectory.mockResolvedValue(dir({ items: [], total: 0, pages: 1, schoolTotal: 0, grades: [] }));
  renderDir();
  expect(await screen.findByText("No students yet")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Invite students" })).toHaveAttribute("href", "/school-admin/users?invite=true");
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
});

it("filters that match nobody offer to clear them", async () => {
  mockParams = new URLSearchParams("search=zzz");
  svc.getStudentDirectory.mockResolvedValue(dir({ items: [], total: 0 }));
  renderDir();
  expect(await screen.findByText("No students match these filters")).toBeInTheDocument();
});

it("a load error can be retried", async () => {
  svc.getStudentDirectory.mockRejectedValueOnce(new Error("boom"));
  renderDir();
  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load the students.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findAllByTestId("student-row")).toHaveLength(2);
});

it("Spanish", async () => {
  mockLang = "es";
  renderDir();
  expect(await screen.findByText("2 estudiantes — abre uno para ver cada resultado, respuesta y PDF")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Abrir los resultados de Ana Pérez" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Usuarios e invitaciones" })).toHaveAttribute("href", "/school-admin/users");
});

it("one student reads in the singular", async () => {
  svc.getStudentDirectory.mockResolvedValue(dir({ items: [student("s1", "Ana")], total: 1, schoolTotal: 1 }));
  renderDir();
  expect(await screen.findByText("1 student — open them to see every result, answer and PDF")).toBeInTheDocument();
});
