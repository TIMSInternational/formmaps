import { polishDescription } from "../polishDescription";

// ── mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/services/aiChatService", () => ({
  askAi: jest.fn(),
}));

import { askAi } from "@/services/aiChatService";

const mockAskAi = askAi as jest.MockedFunction<typeof askAi>;

// ── helpers ───────────────────────────────────────────────────────────────────

afterEach(() => {
  jest.clearAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("polishDescription", () => {
  it("sends a prompt containing '150' to askAi", async () => {
    mockAskAi.mockResolvedValueOnce("Short reply");

    await polishDescription("Some activity description");

    expect(mockAskAi).toHaveBeenCalledTimes(1);
    const [prompt, history] = mockAskAi.mock.calls[0];
    expect(prompt).toContain("150");
    expect(history).toEqual([]);
  });

  it("returns the reply trimmed when it is a normal length", async () => {
    mockAskAi.mockResolvedValueOnce("  Trimmed reply  ");

    const result = await polishDescription("Some activity description");

    expect(result).toBe("Trimmed reply");
  });

  it("hard-caps a 400-char reply to at most 150 chars", async () => {
    const longReply = "A".repeat(400);
    mockAskAi.mockResolvedValueOnce(longReply);

    const result = await polishDescription("Some activity description");

    expect(result.length).toBeLessThanOrEqual(150);
  });

  it("returns the original text trimmed-and-sliced when the reply is empty/whitespace", async () => {
    mockAskAi.mockResolvedValueOnce("   ");

    const original = "  Original description text  ";
    const result = await polishDescription(original);

    expect(result).toBe(original.trim().slice(0, 150));
  });
});
