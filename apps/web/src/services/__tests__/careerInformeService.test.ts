import { getCareerInformeBlob } from "../careerInformeService";
import { apiClient } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({
  apiClient: { request: jest.fn() },
}));

const mockRequest = (apiClient as unknown as { request: jest.Mock }).request;

beforeEach(() => jest.clearAllMocks());

describe("careerInformeService", () => {
  it("calls the correct URL with lang and returns the Blob", async () => {
    const fakeBlob = new Blob(["pdf"], { type: "application/pdf" });
    mockRequest.mockResolvedValue({ data: fakeBlob });

    const result = await getCareerInformeBlob("u1", "es");

    expect(mockRequest).toHaveBeenCalledWith({
      url: "/api/v1/career-informe/u1/pdf?lang=es",
      method: "GET",
      responseType: "blob",
    });
    expect(result).toBe(fakeBlob);
  });

  it("uses en lang param when lang is en", async () => {
    const fakeBlob = new Blob(["pdf"], { type: "application/pdf" });
    mockRequest.mockResolvedValue({ data: fakeBlob });

    await getCareerInformeBlob("stu42", "en");

    expect(mockRequest).toHaveBeenCalledWith({
      url: "/api/v1/career-informe/stu42/pdf?lang=en",
      method: "GET",
      responseType: "blob",
    });
  });

  it("throws when apiClient.request rejects", async () => {
    mockRequest.mockRejectedValue(new Error("network error"));
    await expect(getCareerInformeBlob("u1", "es")).rejects.toThrow("network error");
  });
});
