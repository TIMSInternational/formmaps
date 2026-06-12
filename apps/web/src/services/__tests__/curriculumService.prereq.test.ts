import {
  analyzePrerequisites,
  applyPrereqSuggestions,
  getMyCourseEligibility,
} from "../curriculumService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));

const mockApi = apiRequest as jest.Mock;

describe("curriculumService — prereq analysis + eligibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.mockResolvedValue({ success: true, data: null });
  });

  it("analyze POSTs and unwraps the suggestion array", async () => {
    const suggestions = [
      {
        courseId: "c1",
        courseCode: "MATH101",
        prerequisiteCode: "MATH100",
        confidence: "high" as const,
        reason: "Sequential curriculum",
        source: "pattern" as const,
      },
    ];
    mockApi.mockResolvedValue({ success: true, data: suggestions });
    const result = await analyzePrerequisites();
    expect(result).toEqual(suggestions);
    expect(mockApi).toHaveBeenCalledWith(
      "/api/v1/school-admin/courses/prereq-analysis",
      { method: "POST" }
    );
  });

  it("analyze returns [] on a non-array payload", async () => {
    mockApi.mockResolvedValue({ success: true, data: null });
    const result = await analyzePrerequisites();
    expect(result).toEqual([]);
  });

  it("apply POSTs explicit updates and unwraps {updated}", async () => {
    mockApi.mockResolvedValue({ success: true, data: { updated: 3 } });
    const updates = [{ courseId: "c1", addPrerequisites: ["MATH100"] }];
    const result = await applyPrereqSuggestions(updates);
    expect(result).toEqual({ updated: 3 });
    expect(mockApi).toHaveBeenCalledWith(
      "/api/v1/school-admin/courses/prereq-analysis/apply",
      { method: "POST", data: { updates } }
    );
  });

  it("eligibility GETs and returns an array", async () => {
    const eligibility = [
      {
        courseId: "c2",
        courseCode: "ENG201",
        eligible: false,
        missing: ["ENG101"],
      },
    ];
    mockApi.mockResolvedValue({ success: true, data: eligibility });
    const result = await getMyCourseEligibility();
    expect(result).toEqual(eligibility);
    expect(mockApi).toHaveBeenCalledWith(
      "/api/v1/student/course-plan/eligibility"
    );
  });
});
