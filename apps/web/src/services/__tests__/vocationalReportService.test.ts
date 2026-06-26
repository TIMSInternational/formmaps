import { recompute360, recomputeIntegrated } from "../vocationalReportService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApi = apiRequest as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("vocationalReportService", () => {
  it("recompute360 POSTs the score recompute URL and unwraps .data", async () => {
    mockApi.mockResolvedValue({ success: true, data: { status: "ready", composite: 80, dimensionScores: [], rankings: { interests: [], industries: [], workType: null, openInsights: [] } } });
    const out = await recompute360("stu1");
    expect(mockApi).toHaveBeenCalledWith("/api/v1/vocational360/score/stu1/recompute", { method: "POST" });
    expect(out.status).toBe("ready");
    if (out.status === "ready") expect(out.composite).toBe(80);
  });

  it("recomputeIntegrated POSTs the integrated recompute URL and unwraps .data", async () => {
    mockApi.mockResolvedValue({ success: true, data: { status: "not_ready", missing: ["mil"] } });
    const out = await recomputeIntegrated("stu1");
    expect(mockApi).toHaveBeenCalledWith("/api/v1/vocational360/integrated/stu1/recompute", { method: "POST" });
    expect(out.status).toBe("not_ready");
    if (out.status === "not_ready") expect(out.missing).toEqual(["mil"]);
  });

  it("tolerates an unwrapped payload (data absent) by returning the root", async () => {
    mockApi.mockResolvedValue({ status: "never_computed" });
    const out = await recompute360("stu1");
    expect(out.status).toBe("never_computed");
  });
});
