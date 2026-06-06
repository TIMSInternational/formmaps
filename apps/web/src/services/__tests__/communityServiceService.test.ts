import { apiRequest } from "@/lib/api/apiClient";
import { getMyCommunityService, getStudentCommunityService } from "@/services/communityServiceService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

beforeEach(() => mockApiRequest.mockReset());

const entry = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  organization: "Food Bank",
  description: "Sorting",
  hours: "4", // backend returns Decimal as string
  date: "2026-06-01T00:00:00.000Z",
  status: "pending",
  createdDate: "2026-06-06T00:00:00.000Z",
  ...over,
});

describe("getMyCommunityService", () => {
  it("maps the student endpoint shape ({data:[…],totalHours}) into a summary", async () => {
    // The page reads .entries/.totalHoursLogged — the raw shape rendered a
    // permanent empty state even after a successful 201.
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { data: [entry(), entry({ id: "e2", hours: "2", status: "verified" })], totalHours: 6 },
    });

    const summary = await getMyCommunityService();
    expect(summary.entries).toHaveLength(2);
    expect(summary.totalHoursLogged).toBe(6);
    expect(summary.totalHoursVerified).toBe(2);
    expect(summary.entries[0].hours).toBe(4); // numeric, not string
  });

  it("handles an empty log", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [], totalHours: 0 } });
    const summary = await getMyCommunityService();
    expect(summary.entries).toEqual([]);
    expect(summary.totalHoursLogged).toBe(0);
    expect(summary.totalHoursVerified).toBe(0);
  });
});

describe("getStudentCommunityService", () => {
  it("maps the admin endpoint shape (bare entries array) into a summary", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: [entry({ status: "verified" })] });
    const summary = await getStudentCommunityService("stu-1");
    expect(summary.entries).toHaveLength(1);
    expect(summary.totalHoursLogged).toBe(4);
    expect(summary.totalHoursVerified).toBe(4);
  });
});
