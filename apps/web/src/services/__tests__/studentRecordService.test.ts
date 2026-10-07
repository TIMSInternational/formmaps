import {
  getStudentRecord,
  getAssessmentAnswers,
  getAssessmentAnswersPdfBlob,
  getStudentRecordPdfBlob,
} from "../studentRecordService";
import { apiClient, apiRequest, actingSchoolFetchHeaders } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({
  apiClient: { request: jest.fn() },
  apiRequest: jest.fn(),
  actingSchoolFetchHeaders: jest.fn(),
}));

const mockRequest = (apiClient as unknown as { request: jest.Mock }).request;
const mockApiRequest = apiRequest as jest.Mock;
const mockActing = actingSchoolFetchHeaders as jest.Mock;
const blob = new Blob(["pdf"], { type: "application/pdf" });

beforeEach(() => {
  jest.clearAllMocks();
  mockActing.mockReturnValue({});
});

it("getStudentRecord hits the overview with lang and unwraps data", async () => {
  mockApiRequest.mockResolvedValue({ success: true, data: { reports: [] } });
  await expect(getStudentRecord("u1", "es")).resolves.toEqual({ reports: [] });
  expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/student-record/u1?lang=es", { method: "GET" });
});

it("getAssessmentAnswers hits the answers endpoint for the key", async () => {
  mockApiRequest.mockResolvedValue({ success: true, data: { sections: [] } });
  await expect(getAssessmentAnswers("u1", "mil", "en")).resolves.toEqual({ sections: [] });
  expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/student-record/u1/answers/mil?lang=en", { method: "GET" });
});

it("assessment PDF: blob request with lang and the acting-school header when set", async () => {
  mockActing.mockReturnValue({ "X-Acting-School-Id": "school-a" });
  mockRequest.mockResolvedValue({ data: blob });
  await expect(getAssessmentAnswersPdfBlob("u1", "personality", "es")).resolves.toBe(blob);
  expect(mockRequest).toHaveBeenCalledWith({
    url: "/api/v1/student-record/u1/answers/personality/pdf?lang=es",
    method: "GET",
    responseType: "blob",
    headers: { "X-Acting-School-Id": "school-a" },
  });
});

it("complete record PDF: blob request with lang, no acting header outside a school", async () => {
  mockRequest.mockResolvedValue({ data: blob });
  await expect(getStudentRecordPdfBlob("u 2", "en")).resolves.toBe(blob);
  expect(mockRequest).toHaveBeenCalledWith({
    url: "/api/v1/student-record/u%202/pdf?lang=en",
    method: "GET",
    responseType: "blob",
    headers: {},
  });
});

it("propagates download failures", async () => {
  mockRequest.mockRejectedValue(new Error("403"));
  await expect(getStudentRecordPdfBlob("u1", "en")).rejects.toThrow("403");
});
