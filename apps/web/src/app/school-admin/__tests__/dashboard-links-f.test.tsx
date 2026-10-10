/**
 * Audit F: the school-admin dashboard's "Students" card and the Recent Students "View all" opened
 * Users & invites (/school-admin/users) instead of the student directory the sidebar's Students item opens.
 * Student rows still open the canonical detail page (/school-admin/users/:id; /students/:id redirects there).
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import SchoolAdminDashboard from "../page";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock("motion/react", () => {
  const React = jest.requireActual("react");
  const passthrough = (tag: string) =>
    React.forwardRef(({ initial, animate, transition, whileHover, ...rest }: Record<string, unknown>, ref: unknown) =>
      React.createElement(tag, { ...rest, ref }));
  return { motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }) };
});
jest.mock("@/hooks/useSchoolAdmin", () => ({
  useSchoolAdminStats: () => ({ data: {} }),
  useStudents: () => ({ data: { data: [{ id: "s1", name: "Ana Student", email: "ana@example.test" }] }, isLoading: false }),
}));
jest.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined, isLoading: false }) }));
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
jest.mock("../_components/AIBriefing", () => ({ AIBriefing: () => null }));
jest.mock("@/components/ErrorBoundary", () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => children }));

describe("school-admin dashboard links (audit F)", () => {
  it("the Students card and View all go to the student directory", () => {
    render(<SchoolAdminDashboard />);
    const card = screen.getByText("dashboard.navCards.students.label").closest("a");
    expect(card).toHaveAttribute("href", "/school-admin/students");
    expect(screen.getByText("dashboard.recentStudents.viewAll").closest("a")).toHaveAttribute("href", "/school-admin/students");
  });

  it("no dashboard link opens the Users & invites list itself", () => {
    render(<SchoolAdminDashboard />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/school-admin/users");
  });
});
