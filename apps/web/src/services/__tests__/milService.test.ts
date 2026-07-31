import { submitMILExam, MILSession } from "@/services/milService";
import { useGlobalStore } from "@/store/useGlobalStore";

describe("submitMILExam auth", () => {
  const session: MILSession = {
    examId: "feature-detection-001",
    apiSessionId: "sess-1",
    startTime: "2026-06-05T00:00:00Z",
    answers: [],
    currentQuestion: 20,
    isCompleted: true,
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;
  });

  it("attaches a Bearer token from the store (cookie-less sessions must still authenticate)", async () => {
    useGlobalStore.getState().setUser({ id: "u1", email: "s@t.dev", accessToken: "store-token-123" });

    await submitMILExam(session, "u1");

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer store-token-123");
  });
});
