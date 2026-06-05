import { getSelfEvaluationUrl } from "@/services/evaluationService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

const baseGroup = {
  id: "g-self",
  evaluatorName: "Me",
  evaluatorEmail: "me@t.dev",
  evaluatedUserId: "u1",
  invitationToken: "tok-self-123",
  isEvaluationCompleted: false,
};

describe("getSelfEvaluationUrl", () => {
  beforeEach(() => jest.resetAllMocks());

  it("reuses an existing self group and returns the evaluator URL with the INVITATION TOKEN (not the group id)", async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: [{ ...baseGroup, groupType: "Self", relation: "Self" }],
    });

    const res = await getSelfEvaluationUrl("u1", "Me", "me@t.dev");

    expect(res?.url).toBe("/evaluation/evaluator?token=tok-self-123");
    expect(mockApiRequest).toHaveBeenCalledTimes(1); // no create needed
  });

  it("recognizes legacy self groups stored as groupType Parent + relation Self", async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: [{ ...baseGroup, groupType: "Parent", relation: "Self" }],
    });

    const res = await getSelfEvaluationUrl("u1", "Me", "me@t.dev");
    expect(res?.url).toBe("/evaluation/evaluator?token=tok-self-123");
  });

  it("creates the self group with groupType Self (so the SELF question set is served, not Parent)", async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: [] }) // no groups yet
      .mockResolvedValueOnce({
        success: true,
        data: { ...baseGroup, groupType: "Self", relation: "Self", invitationUrl: "x" },
      });

    const res = await getSelfEvaluationUrl("u1", "Me", "me@t.dev");

    expect(mockApiRequest).toHaveBeenCalledWith(
      "/evaluation/create-group",
      expect.objectContaining({
        method: "POST",
        data: expect.objectContaining({ groupType: "Self", relation: "Self" }),
      }),
    );
    expect(res?.url).toBe("/evaluation/evaluator?token=tok-self-123");
  });

  it("reports completion so callers can route to the management page instead", async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: [{ ...baseGroup, groupType: "Self", relation: "Self", isEvaluationCompleted: true }],
    });

    const res = await getSelfEvaluationUrl("u1", "Me", "me@t.dev");
    expect(res?.completed).toBe(true);
  });
});
