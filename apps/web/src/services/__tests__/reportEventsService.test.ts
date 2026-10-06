import { trackReportDownloaded } from "@/services/reportEventsService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApi = apiRequest as jest.Mock;

describe("trackReportDownloaded", () => {
  beforeEach(() => mockApi.mockReset());

  it("POSTs the report_downloaded event with the resource, without retries or toasts", async () => {
    mockApi.mockResolvedValue({});
    await trackReportDownloaded("pca-report-pdf");
    expect(mockApi).toHaveBeenCalledWith("/api/v1/user/report-events", {
      method: "POST",
      data: { eventType: "report_downloaded", resource: "pca-report-pdf" },
      retries: 0,
      showErrorToast: false,
    });
  });

  it("swallows API failures", async () => {
    mockApi.mockRejectedValue(new Error("500"));
    await expect(trackReportDownloaded("career-informe-pdf")).resolves.toBeUndefined();
  });
});
