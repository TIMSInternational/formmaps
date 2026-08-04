/**
 * batch-3 fix/honest-integrations: the integrations page must show REAL
 * statuses — iSAMS driven by GET /integrations/isams/status, and TIMS PCA
 * labeled honestly as platform-included (never a fabricated per-school
 * "Connected").
 */
import { render, screen, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import IntegrationsPage from "../page";
import { getIsamsStatus } from "@/services/isamsService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === "string" ? d : k) }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/services/isamsService", () => ({ getIsamsStatus: jest.fn() }));
jest.mock("@/hooks/useSchoolAdminAccess", () => ({
  useSchoolAdminAccess: () => ({ schoolId: "school-1" }),
}));

const mockStatus = getIsamsStatus as jest.Mock;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntegrationsPage />
    </QueryClientProvider>
  );
}

function card(name: string) {
  const heading = screen.getByRole("heading", { name });
  // No eslint-disable for testing-library/no-node-access here: that plugin is not
  // installed, so disabling one of its rules IS the error ("rule definition not found").
  return heading.closest("div[style]")?.parentElement as HTMLElement;
}

beforeEach(() => jest.clearAllMocks());

describe("Integrations page — honest statuses", () => {
  it("shows iSAMS as Connected when the real status endpoint says so", async () => {
    mockStatus.mockResolvedValue({ configured: true, enabled: true, connected: true, lastSyncAt: null });
    renderPage();
    await waitFor(() => expect(mockStatus).toHaveBeenCalledWith("school-1"));
    const isams = card("iSAMS");
    await waitFor(() => expect(within(isams).getByText("integrations.status.connected")).toBeInTheDocument());
  });

  it("shows iSAMS as Available when not connected", async () => {
    mockStatus.mockResolvedValue({ configured: false, enabled: false, connected: false, lastSyncAt: null });
    renderPage();
    await waitFor(() => expect(mockStatus).toHaveBeenCalled());
    const isams = card("iSAMS");
    expect(within(isams).getByText("integrations.status.available")).toBeInTheDocument();
    expect(within(isams).queryByText("integrations.status.connected")).toBeNull();
  });

  it("labels TIMS PCA as platform-included, never a per-school 'Connected'", async () => {
    mockStatus.mockResolvedValue({ configured: false, enabled: false, connected: false, lastSyncAt: null });
    renderPage();
    await waitFor(() => expect(mockStatus).toHaveBeenCalled());
    const tims = card("TIMS PCA");
    expect(within(tims).getByText("integrations.status.included")).toBeInTheDocument();
    expect(within(tims).queryByText("integrations.status.connected")).toBeNull();
  });
});
