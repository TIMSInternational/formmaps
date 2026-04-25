import { uploadGrades } from "@/services/gradeImportService";

describe("gradeImportService", () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("uploads file and returns job response when API returns ok", async () => {
    const mockResponse = { success: true, jobId: "job-123", rowsProcessed: 2 };
    (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => mockResponse });

    const file = new File(["a,b\n1,2"], "grades.csv", { type: "text/csv" });
    const res = await uploadGrades(file, "school-1");

    expect((global as any).fetch).toHaveBeenCalled();
    expect(res).toEqual(mockResponse);
  });

  it("throws when API responds with non-ok status", async () => {
    (global as any).fetch.mockResolvedValueOnce({ ok: false, statusText: "Bad Request", json: async () => ({ message: "invalid" }) });
    const file = new File([""], "grades.csv", { type: "text/csv" });
    await expect(uploadGrades(file, "school-1")).rejects.toThrow();
  });
});
