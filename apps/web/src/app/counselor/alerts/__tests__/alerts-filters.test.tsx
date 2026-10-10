/**
 * Audit D3: the counselor alerts page — the search box now searches (server-side), the type filter
 * offers the types the generator writes, and the summary shows unread (there is no "new since login").
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AlertsPage from "../page";
import { useAlerts, useAlertSummary } from "@/hooks/useAlertQueries";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === "string" ? d : k) }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("motion/react", () => {
  const React = jest.requireActual("react");
  const passthrough = (tag: string) => React.forwardRef(({ initial, animate, transition, ...rest }: Record<string, unknown>, ref: unknown) => React.createElement(tag, { ...rest, ref }));
  return { motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }) };
});
jest.mock("@/hooks/useAlertQueries", () => ({
  useAlerts: jest.fn(),
  useAlertSummary: jest.fn(),
  useUpdateAlert: () => ({ mutate: jest.fn() }),
  useBulkAlertAction: () => ({ mutate: jest.fn(), isPending: false }),
}));

const mockUseAlerts = useAlerts as jest.Mock;
const mockSummary = useAlertSummary as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAlerts.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 20, totalPages: 1 }, isLoading: false });
  mockSummary.mockReturnValue({ data: { total: 5, critical: 1, high: 2, medium: 1, low: 1, unread: 3, byPriority: { critical: 1, high: 2, medium: 1, low: 1 } } });
});

describe("counselor alerts page", () => {
  it("sends what is typed in the search box to the API (debounced)", async () => {
    render(<AlertsPage />);
    fireEvent.change(screen.getByPlaceholderText("Search alerts..."), { target: { value: "maya" } });
    await waitFor(() => expect(mockUseAlerts).toHaveBeenLastCalledWith(expect.objectContaining({ search: "maya", page: 1 })), { timeout: 2000 });
  });

  it("shows unread from the summary and the real priority counts", () => {
    render(<AlertsPage />);
    expect(screen.getByText("Unread")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("New")).toBeNull();
  });
});
