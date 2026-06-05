import { questions360Service } from "@/services/questions360Service";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

// apiRequest resolves the API envelope {success, data}. Every method must
// unwrap .data — returning the envelope crashes consumers that read fields
// off the "question" object.
const q = { id: "q1", questionEnglishText: "Q?", questionNumber: 1, isActive: true };

describe("questions360Service envelope unwrapping", () => {
  afterEach(() => jest.resetAllMocks());

  it("getQuestionById returns the question, not the envelope", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: q });
    const res = await questions360Service.getQuestionById("q1");
    expect(res.id).toBe("q1");
    expect((res as any).data).toBeUndefined();
  });

  it("getQuestionsByCategory returns the array, not the envelope", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: [q] });
    const res = await questions360Service.getQuestionsByCategory("general");
    expect(Array.isArray(res)).toBe(true);
    expect(res[0].id).toBe("q1");
  });

  it("getQuestionsByRelationType returns the array", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: [q] });
    const res = await questions360Service.getQuestionsByRelationType("Parent");
    expect(res[0].id).toBe("q1");
  });

  it("createQuestion / updateQuestion return the created/updated question", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: q });
    expect((await questions360Service.createQuestion(q as any)).id).toBe("q1");
    expect((await questions360Service.updateQuestion("q1", q as any)).id).toBe("q1");
  });

  it("activateQuestion / deactivateQuestion return the question", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: q });
    expect((await questions360Service.activateQuestion("q1")).id).toBe("q1");
    expect((await questions360Service.deactivateQuestion("q1")).id).toBe("q1");
  });

  it("bulkCreateQuestions hits the real backend path /bulk-create and unwraps", async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { createdCount: 2, totalRequested: 3, errors: [{ questionNumber: 3, error: "Duplicate question" }] },
    });
    const res = await questions360Service.bulkCreateQuestions({ questions: [] });
    expect(mockApiRequest).toHaveBeenCalledWith("/api/question360/bulk-create", expect.objectContaining({ method: "POST" }));
    expect(res.created).toBe(2);
    expect(res.failed).toBe(1);
  });
});
