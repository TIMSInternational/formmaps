import { apiRequest } from "@/lib/api/apiClient";
import { getConversationMessages, getUnreadCount } from "@/services/messageService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

beforeEach(() => mockApiRequest.mockReset());

describe("getConversationMessages", () => {
  it("unwraps the paginated envelope ({data:{data:[…],total}}) into {messages,total}", async () => {
    // Real backend shape — messages live at data.data, NOT data.messages.
    // The page reads `.messages`, so getting this wrong rendered every
    // thread as "No messages yet" forever.
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        data: [{ id: "m1", senderId: "u1", content: "hi", messageType: "text", readAt: null, createdDate: "2026-06-06T00:00:00Z" }],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      },
    });

    const result = await getConversationMessages("conv1");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("hi");
    expect(result.total).toBe(1);
  });

  it("returns empty messages for an empty conversation", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [], total: 0, page: 1, limit: 50, totalPages: 0 } });
    const result = await getConversationMessages("conv1");
    expect(result.messages).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("getUnreadCount", () => {
  it("reads unreadCount from the data envelope (not .count)", async () => {
    // API returns { success, data: { unreadCount: N } } — the old service read
    // res?.data?.count which is always undefined, returning 0 regardless.
    mockApiRequest.mockResolvedValue({ success: true, data: { unreadCount: 5 } });
    const count = await getUnreadCount();
    expect(count).toBe(5);
  });

  it("returns 0 when there are no unread messages", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { unreadCount: 0 } });
    const count = await getUnreadCount();
    expect(count).toBe(0);
  });
});
