/**
 * Users & invites → roster status. The "All / Active / Pending / Inactive" select was sent and ignored (always active
 * students), and the badge printed the raw English value. Now the select is honoured by the API (status=all|active|
 * pending|inactive) and each row's badge says, translated, whether the student accepted their invite.
 */
import { render, screen } from "@testing-library/react";
import StudentsPage from "../page";
import { useStudents } from "@/hooks/useSchoolAdmin";

let mockLang: "en" | "es" = "en";
jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const insts: Record<string, ReturnType<typeof createTestI18n>> = {};
  const get = (l: "en" | "es") => (insts[l] ??= createTestI18n(l));
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: (ns?: string) => ({ t: get(mockLang).getFixedT(null, ns ?? "common"), i18n: get(mockLang) }),
  };
});
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/hooks/useSchoolAdmin", () => ({
  useStudents: jest.fn(),
  useSchoolAdminStats: () => ({ data: { totalStudents: 3, activeStudents: 1 }, isLoading: false }),
}));

const students = useStudents as jest.MockedFunction<typeof useStudents>;
const ROWS = [
  { id: "s1", name: "Ana", email: "ana@x.test", roleName: "student", gradeLevel: 10, status: "active", createdDate: "2026-09-01" },
  { id: "s2", name: "Bruno", email: "bruno@x.test", roleName: "student", gradeLevel: 10, status: "pending", createdDate: "2026-09-02" },
  { id: "s3", name: "Carla", email: "carla@x.test", roleName: "student", gradeLevel: 11, status: "inactive", createdDate: "2026-09-03" },
];

beforeEach(() => {
  mockLang = "en";
  students.mockReset();
  students.mockReturnValue({ data: { data: ROWS, total: 3, totalPages: 1 }, isLoading: false } as never);
});

it("'All statuses' asks the API for everyone (status=all), not 'no filter'", () => {
  render(<StudentsPage />);
  expect(students).toHaveBeenCalledWith(expect.objectContaining({ status: "all" }));
});

it("each row's badge says Active / Pending / Inactive", () => {
  render(<StudentsPage />);
  const badges = screen.getAllByTestId("roster-status");
  expect(badges.map((b) => [b.getAttribute("data-status"), b.textContent])).toEqual([
    ["active", "Active"], ["pending", "Pending"], ["inactive", "Inactive"],
  ]);
});

it("Spanish badges", () => {
  mockLang = "es";
  render(<StudentsPage />);
  expect(screen.getAllByTestId("roster-status").map((b) => b.textContent)).toEqual(["Activo", "Pendiente", "Inactivo"]);
});
