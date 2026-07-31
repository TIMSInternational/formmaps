import { apiRequest } from "@/lib/api/apiClient";
import { askAi } from "@/services/aiChatService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

beforeEach(() => mockApiRequest.mockReset());

describe("askAi", () => {
  it("posts to the platform aichat endpoint (NOT the legacy localhost:8000 service)", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { message: "Here is some advice.", role: "assistant" } });

    const reply = await askAi("What skills should I develop?", [{ role: "user", content: "hi" }]);

    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/v1/aichat/ask",
      expect.objectContaining({
        method: "POST",
        data: {
          message: "What skills should I develop?",
          conversationHistory: [{ role: "user", content: "hi" }],
        },
      })
    );
    expect(reply).toBe("Here is some advice.");
  });

  it("returns empty string when the response has no message", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: {} });
    expect(await askAi("hello", [])).toBe("");
  });
});
