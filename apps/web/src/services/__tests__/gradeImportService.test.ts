import { apiRequest } from "@/lib/api/apiClient";
import { uploadGrades } from "@/services/gradeImportService";

// The service goes through the shared axios apiClient (not fetch) — mock it
// like every other service test.
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

beforeEach(() => mockApiRequest.mockReset());

describe("gradeImportService", () => {
  it("uploads file and returns job response when API returns ok", async () => {
    const mockResponse = { success: true, data: { jobId: "job-123", rowsProcessed: 2 } };
    mockApiRequest.mockResolvedValueOnce(mockResponse);

    const file = new File(["a,b\n1,2"], "grades.csv", { type: "text/csv" });
    const res = await uploadGrades(file, "school-1");

    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/v1/school-admin/grades/import?schoolId=school-1",
      expect.objectContaining({ method: "POST" })
    );
    const formData = mockApiRequest.mock.calls[0][1].data as FormData;
    expect(formData.get("file")).toBeInstanceOf(File);
    expect(res).toEqual({ jobId: "job-123", rowsProcessed: 2 });
  });

  it("throws when the API rejects", async () => {
    mockApiRequest.mockRejectedValueOnce(new Error("Bad Request"));
    const file = new File([""], "grades.csv", { type: "text/csv" });
    await expect(uploadGrades(file, "school-1")).rejects.toThrow();
  });
});
