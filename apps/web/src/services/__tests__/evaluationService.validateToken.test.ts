import { validateEvaluationToken } from "@/services/evaluationService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

describe("validateEvaluationToken — instrument extraction from apiRequest envelope", () => {
  beforeEach(() => jest.resetAllMocks());

  it("extracts instrument='vocational' from the envelope .data level", async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: {
        instrument: "vocational",
        groupType: "teacher",
        isTokenUsed: false,
        evaluatorName: "QA Teacher",
        evaluatorEmail: "qa.teacher@test.dev",
        relation: "teacher",
        evaluatedUserId: "u-student-1",
        tokenExpiryDate: "2030-01-01T00:00:00.000Z",
        isEvaluationCompleted: false,
      },
    });

    const result = await validateEvaluationToken("voc-token-123");

    expect(result.isValid).toBe(true);
    expect(result.instrument).toBe("vocational");
  });

  it("resolves instrument to null when envelope data has instrument=null", async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: {
        instrument: null,
        groupType: "Parent",
        isTokenUsed: false,
        evaluatorName: "QA Parent",
        evaluatorEmail: "qa.parent@test.dev",
        relation: "Parent",
        evaluatedUserId: "u-student-2",
        tokenExpiryDate: "2030-01-01T00:00:00.000Z",
        isEvaluationCompleted: false,
      },
    });

    const result = await validateEvaluationToken("generic-token-456");

    expect(result.isValid).toBe(true);
    expect(result.instrument).toBeNull();
  });
});
