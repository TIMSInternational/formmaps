/**
 * Audit D3: the school-admin alert inbox — real alert types get their own label (every alert used to
 * render as "General"), search goes to the server across all pages, and the summary shows unread.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AlertsPanel from "../AlertsPanel";
import { useAlerts, useAlertSummary } from "@/hooks/useAlertQueries";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === "string" ? d : k) }),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/hooks/useAlertQueries", () => ({
  useAlerts: jest.fn(),
  useAlertSummary: jest.fn(),
  useUpdateAlert: () => ({ mutate: jest.fn() }),
  useBulkAlertAction: () => ({ mutate: jest.fn(), isPending: false }),
}));

const mockUseAlerts = useAlerts as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAlerts.mockReturnValue({
    data: {
      data: [{ id: "a1", type: "low_gpa", priority: "medium", status: "active", title: "Low GPA", message: "GPA 1.8", studentName: "Maya", studentId: "s1", createdAt: "2026-10-01T00:00:00Z" }],
      total: 1, page: 1, limit: 15, totalPages: 1,
    },
    isLoading: false,
  });
  (useAlertSummary as jest.Mock).mockReturnValue({ data: { total: 1, critical: 0, high: 0, medium: 1, low: 0, unread: 1, byPriority: { critical: 0, high: 0, medium: 1, low: 0 } } });
});

describe("school-admin alerts panel", () => {
  it("labels a generated alert by its real type", () => {
    render(<AlertsPanel />);
    expect(screen.getAllByText("ui.alerts.type.low_gpa").length).toBeGreaterThan(0);
    expect(screen.queryByText("ui.alerts.type.general")).toBeNull();
  });

  it("shows unread in the summary", () => {
    render(<AlertsPanel />);
    expect(screen.getByText("ui.alerts.unread")).toBeInTheDocument();
  });

  it("searches on the server instead of filtering the visible page", async () => {
    render(<AlertsPanel />);
    fireEvent.change(screen.getByPlaceholderText("school_admin:ui.alerts.searchPlaceholder"), { target: { value: "nobody" } });
    await waitFor(() => expect(mockUseAlerts).toHaveBeenLastCalledWith(expect.objectContaining({ search: "nobody", page: 1 })), { timeout: 2000 });
  });
});
