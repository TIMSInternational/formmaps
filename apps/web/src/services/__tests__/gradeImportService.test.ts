import { apiRequest } from "@/lib/api/apiClient";
import { uploadGrades, EmptyGradeCsvError } from "@/services/gradeImportService";
import { parseGradeCsv } from "@/lib/gradeCsv";

// The service goes through the shared axios apiClient (not fetch) — mock it
// like every other service test.
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

beforeEach(() => mockApiRequest.mockReset());

const csv = "Email,Course_Code,Grade,Credits,Term\nana@s.edu,MATH1,A,1,Fall\n\"x@s.edu\",\"ENG, honors\",B+,1,Fall\n,MATH1,C,1,Fall\n";
const fileOf = (text: string) => {
  const f = new File([text], "grades.csv", { type: "text/csv" });
  // jsdom's File has no .text() in some versions
  if (typeof (f as File & { text?: unknown }).text !== "function") Object.defineProperty(f, "text", { value: async () => text });
  return f;
};

describe("gradeImportService (audit 2026-10-09 C4)", () => {
  it("posts the parsed rows as JSON — the API never accepted a multipart file", async () => {
    mockApiRequest.mockResolvedValueOnce({ success: true, data: { jobId: "job-123", totalRows: 2 } });

    const res = await uploadGrades(fileOf(csv), "school-1");

    const [url, opts] = mockApiRequest.mock.calls[0];
    expect(url).toBe("/api/v1/school-admin/grades/import");
    expect(opts.data).not.toBeInstanceOf(FormData);
    expect(opts.data.filename).toBe("grades.csv");
    expect(opts.data.rows).toEqual(parseGradeCsv(csv));
    expect(res).toEqual({ jobId: "job-123", totalRows: 2 });
  });

  it("a CSV with no usable rows is refused before calling the API", async () => {
    await expect(uploadGrades(fileOf("email,grade\n"), "s")).rejects.toBeInstanceOf(EmptyGradeCsvError);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("throws when the API rejects", async () => {
    mockApiRequest.mockRejectedValueOnce(new Error("Bad Request"));
    await expect(uploadGrades(fileOf(csv), "school-1")).rejects.toThrow("Bad Request");
  });
});

describe("parseGradeCsv", () => {
  it("reads quoted cells, aliases headers, skips rows without grade or student", () => {
    expect(parseGradeCsv(csv)).toEqual([
      { email: "ana@s.edu", studentId: "", courseCode: "MATH1", grade: "A", credits: "1", semester: "Fall", status: "completed" },
      { email: "x@s.edu", studentId: "", courseCode: "ENG, honors", grade: "B+", credits: "1", semester: "Fall", status: "completed" },
    ]);
  });
});
