import { apiRequest } from "@/lib/api/apiClient";
import { getChildProgress, getParentNotifications } from "@/services/parentPortalService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

// batch-1 fix/broken-pages: the API returns a nested shape; the page reads a
// flat one. Without the mapping the page showed a blank name, "undefined/
// undefined" credits, and a permanent "At Risk".
describe("getChildProgress flattens the nested API shape", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps student/creditProgress/assessments/isOnTrack to the flat summary", async () => {
    mockApiRequest.mockResolvedValue({
      data: {
        student: { id: "stu-1", name: "Kid Student", gradeLevel: 11 },
        gpa: 3.4,
        isOnTrack: true,
        creditProgress: { earned: 18, required: 24, percentage: 75 },
        assessments: {
          pca: { completed: true },
          mil: { completed: 5, total: 5 },
          evaluation360: { completed: 2, total: 3 },
        },
      },
    });

    const p = await getChildProgress("stu-1");
    expect(p.studentName).toBe("Kid Student");
    expect(p.gradeLevel).toBe(11);
    expect(p.gpa).toBe(3.4);
    expect(p.isOnTrack).toBe(true);
    expect(p.creditsEarned).toBe(18);
    expect(p.creditsRequired).toBe(24);
    expect(p.creditPercentage).toBe(75);
    // pca done + mil done (5/5), 360 not fully done (2/3) → 2 of 3
    expect(p.assessmentStatus).toEqual({ completed: 2, total: 3 });
  });

  it("defaults safely when the API omits fields (new student, no At-Risk)", async () => {
    mockApiRequest.mockResolvedValue({
      data: { student: { id: "stu-2", name: "New Kid", gradeLevel: 9 }, gpa: null },
    });
    const p = await getChildProgress("stu-2");
    expect(p.studentName).toBe("New Kid");
    expect(p.isOnTrack).toBe(true);
    expect(p.gpa).toBeNull(); // null → page shows "N/A", not a misleading "0.00"
    expect(p.creditsEarned).toBe(0);
    expect(p.assessmentStatus).toEqual({ completed: 0, total: 3 });
  });
});

// formmaps#93. GET /parent/notifications answers with a paginated envelope —
// `{ data: { data: [...], total, page, limit } }` — but the service returned
// `res.data`, i.e. the envelope, while declaring `Promise<ParentNotification[]>`.
// The page's `Array.isArray(...) ? ... : []` guard then swallowed it whole and
// rendered "all caught up" no matter how many notifications the parent had.
describe("getParentNotifications unwraps the paginated envelope", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the rows, not the envelope", async () => {
    mockApiRequest.mockResolvedValue({
      data: {
        data: [
          { id: "n-1", title: "New grade", message: "Math posted", type: "grade", isRead: false, createdDate: "2026-08-01T10:00:00Z" },
          { id: "n-2", title: "Meeting", message: "Thursday 3pm", type: "meeting", isRead: true, createdDate: "2026-07-30T10:00:00Z" },
        ],
        total: 2,
        page: 1,
        limit: 20,
      },
    });

    const rows = await getParentNotifications();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.map((n) => n.id)).toEqual(["n-1", "n-2"]);
    // The two fields the type used to get wrong: the row carries `message` and
    // `createdDate`, never `body` or `createdAt`.
    expect(rows[0].message).toBe("Math posted");
    expect(rows[0].createdDate).toBe("2026-08-01T10:00:00Z");
  });

  it("still works if the endpoint is ever flattened to a bare array", async () => {
    mockApiRequest.mockResolvedValue({ data: [{ id: "n-1" }] });
    expect(await getParentNotifications()).toHaveLength(1);
  });

  it("returns [] rather than a non-array when there is nothing to show", async () => {
    mockApiRequest.mockResolvedValue({ data: { data: [], total: 0 } });
    expect(await getParentNotifications()).toEqual([]);
    mockApiRequest.mockResolvedValue({});
    expect(await getParentNotifications()).toEqual([]);
  });
});
