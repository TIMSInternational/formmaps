/**
 * batch-3 fix/honest-integrations: getIsamsStatus must unwrap the API
 * envelope. apiRequest resolves to {success, data} — the panel reads
 * `status.connected`, which lived at `.data.connected` and was always
 * undefined (the recurring envelope gotcha).
 */
import { getIsamsStatus } from "../isamsService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));

const mockApi = apiRequest as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("getIsamsStatus envelope", () => {
  it("unwraps {success, data} to the status object", async () => {
    mockApi.mockResolvedValue({ success: true, data: { configured: true, enabled: true, connected: true, lastSyncAt: null } });
    const s = await getIsamsStatus("school-1");
    expect(s.connected).toBe(true);
    expect(s.configured).toBe(true);
  });

  it("returns connected:false when the request fails", async () => {
    mockApi.mockRejectedValue(new Error("network"));
    const s = await getIsamsStatus("school-1");
    expect(s.connected).toBe(false);
  });
});
