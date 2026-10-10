/**
 * Audit 2026-10-09 D5: the Staff tab's "All roles" listed students and parents, and its role cards counted only the
 * 10 rows on screen. It now asks for scope "staff" and shows the server's whole-set role counts.
 */
import "@/lib/i18n";
import { render, screen } from "@testing-library/react";
import { StaffPanel } from "../StaffPanel";
import { useSchoolUsers, useInviteStaff } from "@/hooks/useSchoolProfileQueries";

jest.mock("@/hooks/useSchoolProfileQueries", () => ({
  useSchoolUsers: jest.fn(),
  useInviteStaff: jest.fn(),
}));
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
jest.mock("@/app/admin/_components/AdminStatCard", () => ({
  AdminStatCard: ({ label, value }: { label: string; value: string }) => <div>{`${label}: ${value}`}</div>,
}));

const mockUsers = useSchoolUsers as jest.Mock;

beforeEach(() => {
  (useInviteStaff as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  mockUsers.mockReturnValue({
    data: {
      data: [{ id: "c1", name: "Carla", email: "c@s.dev", roleName: "counselor", status: "active" }],
      total: 1, page: 1, limit: 10, totalPages: 1,
      roleCounts: { counselor: 12, teacher: 30, schoolAdmin: 2 },
    },
    isLoading: false,
    refetch: jest.fn(),
  });
});

it("asks for staff only", () => {
  render(<StaffPanel />);
  expect(mockUsers).toHaveBeenCalledWith(expect.objectContaining({ scope: "staff" }));
});

it("shows counts over the whole staff, not the rows on screen", () => {
  render(<StaffPanel />);
  expect(screen.getByText("Total staff: 44")).toBeInTheDocument(); // 12 + 30 + 2
  expect(screen.getByText("Counselors: 12")).toBeInTheDocument();
  expect(screen.getByText("Teachers: 30")).toBeInTheDocument();
});
