import { apiRequest } from "@/lib/api/apiClient";
import { getChildProgress } from "@/services/parentPortalService";

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
