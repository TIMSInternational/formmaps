import {
  getGraduationTarget,
  setGraduationTarget,
  generateGraduationPlan,
  getMyGraduationPlan,
  submitGraduationPlan,
  discardGraduationDraft,
  getSupplementalCourses,
  getStudentGraduationPlan,
  counselorGenerateGraduationPlan,
  reviewGraduationPlan,
  getChildCoursePlan,
} from "../graduationPlanService";
import { apiRequest } from "@/lib/api/apiClient";
import { isLockedResult, getPlanErrorCode } from "@/types/graduationPlan";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));

const mockApi = apiRequest as jest.Mock;

describe("graduationPlanService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.mockResolvedValue({ success: true, data: null });
  });

  it("gets the student's target", async () => {
    const target = { universityName: "MIT", major: "CS", suggested: false };
    mockApi.mockResolvedValue({ success: true, data: target });
    expect(await getGraduationTarget()).toEqual(target);
    expect(mockApi).toHaveBeenCalledWith("/api/v1/student/graduation-plan/target");
  });

  it("sets the target with PUT (no PATCH)", async () => {
    await setGraduationTarget({ universityId: "u1", major: "Computer Science" });
    expect(mockApi).toHaveBeenCalledWith("/api/v1/student/graduation-plan/target", {
      method: "PUT",
      data: { universityId: "u1", major: "Computer Science" },
    });
  });

  it("generates a draft (force regenerate passes ?force=true)", async () => {
    await generateGraduationPlan();
    expect(mockApi).toHaveBeenCalledWith("/api/v1/student/graduation-plan/generate", { method: "POST" });
    await generateGraduationPlan({ force: true });
    expect(mockApi).toHaveBeenCalledWith("/api/v1/student/graduation-plan/generate?force=true", { method: "POST" });
  });

  it("generate returns the locked shape when assessments are incomplete", async () => {
    const completion = { allDone: false, liaCompleted: 2, pcaCompleted: false, evalCompleted: 0, evalTotal: 1 };
    mockApi.mockResolvedValue({ success: true, data: { locked: true, completion } });
    const result = await generateGraduationPlan();
    expect(isLockedResult(result)).toBe(true);
  });

  it("gets the current plan (null when none)", async () => {
    mockApi.mockResolvedValue({ success: true, data: null });
    expect(await getMyGraduationPlan()).toBeNull();
    expect(mockApi).toHaveBeenCalledWith("/api/v1/student/graduation-plan");
  });

  it("submits and discards", async () => {
    await submitGraduationPlan();
    expect(mockApi).toHaveBeenCalledWith("/api/v1/student/graduation-plan/submit", { method: "POST" });
    await discardGraduationDraft();
    expect(mockApi).toHaveBeenCalledWith("/api/v1/student/graduation-plan", { method: "DELETE" });
  });

  it("gets supplemental courses as an array", async () => {
    mockApi.mockResolvedValue({ success: true, data: [{ id: "g1", title: "ML Basics" }] });
    const courses = await getSupplementalCourses();
    expect(courses).toHaveLength(1);
  });

  it("counselor endpoints hit the assignment-gated routes", async () => {
    mockApi.mockResolvedValue({ success: true, data: { plan: null, target: null } });
    await getStudentGraduationPlan("stu-1");
    expect(mockApi).toHaveBeenCalledWith("/api/v1/counselor/me/students/stu-1/graduation-plan");
    await counselorGenerateGraduationPlan("stu-1", { force: true });
    expect(mockApi).toHaveBeenCalledWith(
      "/api/v1/counselor/me/students/stu-1/graduation-plan/generate?force=true",
      { method: "POST" },
    );
    await reviewGraduationPlan("stu-1", { status: "rejected", note: "Too many honors" });
    expect(mockApi).toHaveBeenCalledWith(
      "/api/v1/counselor/me/students/stu-1/graduation-plan/review",
      { method: "PUT", data: { status: "rejected", note: "Too many honors" } },
    );
  });

  it("parent endpoint reads the child's course plan", async () => {
    mockApi.mockResolvedValue({ success: true, data: { target: null, approvedPlan: null, currentCourses: [] } });
    const res = await getChildCoursePlan("stu-1");
    expect(res.currentCourses).toEqual([]);
    expect(mockApi).toHaveBeenCalledWith("/api/v1/parent/children/stu-1/course-plan");
  });
});

describe("getPlanErrorCode", () => {
  it("extracts known codes from apiClient errors", () => {
    const err = Object.assign(new Error("Plan request cannot be fulfilled"), {
      status: 422,
      data: { success: false, code: "NO_RULESET" },
    });
    expect(getPlanErrorCode(err)).toBe("NO_RULESET");
  });

  it("returns null for unknown codes or plain errors", () => {
    expect(getPlanErrorCode(new Error("boom"))).toBeNull();
    const err = Object.assign(new Error("x"), { data: { code: "SOMETHING_ELSE" } });
    expect(getPlanErrorCode(err)).toBeNull();
  });
});
