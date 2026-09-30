import { recompute360, recomputeIntegrated, getOptionLabels } from "../vocationalReportService";
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

  it("getOptionLabels asks for every rater group (the API 400s without one) and merges their labels", async () => {
    mockApi.mockImplementation(async (url: string) => {
      const group = new URL(url, "http://x").searchParams.get("group");
      if (group === "teacher") throw new Error("boom");
      const questions = [
        { options: [{ value: "ingenieria", labelEs: "Ingeniería", labelEn: "Engineering", label: "Ingeniería" }] },
        { options: null },
        { options: [{ value: `only_${group}`, labelEs: `solo ${group}`, label: `solo ${group}` }] },
      ];
      // The real API returns the array itself as `data`; one group uses the { questions } form.
      return { success: true, data: group === "parent" ? { questions } : questions };
    });
    const labels = await getOptionLabels("es");
    expect(mockApi.mock.calls.map(([u]) => u)).toEqual([
      "/api/v1/vocational360/questionnaire?group=self&lang=es",
      "/api/v1/vocational360/questionnaire?group=parent&lang=es",
      "/api/v1/vocational360/questionnaire?group=teacher&lang=es",
      "/api/v1/vocational360/questionnaire?group=sibling_friend&lang=es",
    ]);
    expect(labels).toEqual({
      ingenieria: "Ingeniería", only_self: "solo self", only_parent: "solo parent", only_sibling_friend: "solo sibling_friend",
    });
  });
});
