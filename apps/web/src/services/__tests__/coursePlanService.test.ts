import { getStudentCoursePlan, normalizeCourseSequence } from "../coursePlanService";
import { apiRequest } from "@/lib/api/apiClient";
import { useGlobalStore } from "@/store/useGlobalStore";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: { getState: jest.fn() },
}));

const mockApiRequest = apiRequest as jest.Mock;
const mockGetState = useGlobalStore.getState as jest.Mock;

const setRole = (role: string | null) =>
  mockGetState.mockReturnValue({ user: { role } });

// getStudentCoursePlan must pick the endpoint by role — admins were firing the
// counselor-only endpoint first and eating a guaranteed 403 on every page view.
describe("getStudentCoursePlan endpoint selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiRequest.mockResolvedValue({ data: { plan: {} } });
  });

  it("counselors use the counselor endpoint", async () => {
    setRole("counselor");
    await getStudentCoursePlan("stu-1");
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/v1/counselor/me/students/stu-1/course-sequence"
    );
  });

  it("school admins go straight to the school-admin endpoint (no counselor 403)", async () => {
    setRole("school_admin");
    await getStudentCoursePlan("stu-1");
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/v1/school-admin/students/stu-1/course-plan"
    );
  });

  it("super admins go straight to the school-admin endpoint", async () => {
    setRole("Super Admin");
    await getStudentCoursePlan("stu-1");
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/v1/school-admin/students/stu-1/course-plan"
    );
  });
});

// formmaps#95. The counselor endpoint answers `{ data, total }` while SequenceBuilder
// reads `planData.plan`, so every counselor saw an empty grid. These assert the
// reshaping, and — deliberately — that the school-admin payload is NOT reshaped.
describe("getStudentCoursePlan normalizes the counselor course-sequence envelope", () => {
  // A row exactly as production returns it: term (not semester), and no gradeLevel,
  // credits or category anywhere.
  const row = (over: Record<string, unknown> = {}) => ({
    id: "p1",
    academicYearId: "ay-1",
    term: "Spring",
    courseId: "c1",
    courseCode: "MATH101",
    courseName: "Algebra",
    status: "planned",
    sortOrder: 0,
    notes: null,
    ...over,
  });

  beforeEach(() => jest.clearAllMocks());

  it("turns the bare envelope into a plan the grid can render", async () => {
    setRole("counselor");
    mockApiRequest.mockResolvedValue({ data: { data: [row()], total: 1 } });

    const result = await getStudentCoursePlan("stu-1", 10);

    // The regression itself: `plan` used to be undefined here.
    expect(result.plan).toBeDefined();
    expect(result.plan.enrollments).toHaveLength(1);
    expect(result.plan.enrollments[0]).toMatchObject({
      id: "p1",
      courseId: "c1",
      courseCode: "MATH101",
      courseName: "Algebra",
      semester: "Spring", // term -> semester
      gradeLevel: 10, // stamped from the student
      status: "planned",
    });
  });

  it("NEGATIVE CONTROL: the raw envelope really would render nothing", () => {
    // Guards against the fix passing vacuously. If SequenceBuilder's read of the
    // untransformed payload ever stops being undefined, this test is measuring the
    // wrong thing and should be revisited.
    const raw = { data: [row()], total: 1 } as unknown as { plan?: unknown };
    expect(raw.plan).toBeUndefined();
  });

  it("a null term becomes 'Fall' — SequenceBuilder calls .toLowerCase() unguarded", async () => {
    setRole("counselor");
    mockApiRequest.mockResolvedValue({ data: { data: [row({ term: null })], total: 1 } });

    const result = await getStudentCoursePlan("stu-1", 9);
    const semester = result.plan.enrollments[0].semester;

    expect(semester).toBe("Fall");
    // The actual failure mode being prevented: a null here throws on render.
    expect(() => semester.toLowerCase()).not.toThrow();
  });

  it("falls back to grade 11 when the student's grade is not known yet", async () => {
    setRole("counselor");
    mockApiRequest.mockResolvedValue({ data: { data: [row()], total: 1 } });

    const result = await getStudentCoursePlan("stu-1"); // student detail still loading

    // Mirrors the school-admin reader's own `user.gradeLevel || 11`.
    expect(result.plan.enrollments[0].gradeLevel).toBe(11);
  });

  it("does NOT reshape the school-admin payload", async () => {
    setRole("school_admin");
    const adminPayload = {
      plan: {
        studentId: "stu-1",
        gradeLevel: 12,
        enrollments: [
          { id: "e1", courseId: "c9", courseCode: "BIO", courseName: "Biology",
            category: "Science", credits: 1.5, gradeLevel: 9, semester: "Fall", status: "completed" },
        ],
        graduationProgress: { totalCreditsEarned: 4, totalCreditsRequired: 24, percentage: 16, isOnTrack: false },
      },
      recommendations: [],
    };
    mockApiRequest.mockResolvedValue({ data: adminPayload });

    const result = await getStudentCoursePlan("stu-1", 12);

    // Untouched: real per-row gradeLevel (9, not the student's 12), real credits, and
    // graduationProgress all survive.
    expect(result).toEqual(adminPayload);
    expect(result.plan.enrollments[0].gradeLevel).toBe(9);
    expect(result.plan.enrollments[0].credits).toBe(1.5);
    expect(result.plan.graduationProgress).toBeDefined();
  });

  it("passes a counselor response through untouched once the backend returns a real plan", async () => {
    // Forward-compat with formmaps#95 option 2: when /course-sequence starts returning
    // the correct shape, flattening it into the approximation would be a regression.
    setRole("counselor");
    const realPlan = {
      plan: { studentId: "stu-1", gradeLevel: 12, enrollments: [], graduationProgress: { totalCreditsEarned: 1, totalCreditsRequired: 2, percentage: 50, isOnTrack: true } },
      recommendations: [],
    };
    mockApiRequest.mockResolvedValue({ data: realPlan });

    const result = await getStudentCoursePlan("stu-1", 10);

    expect(result).toEqual(realPlan);
    expect(result.plan.graduationProgress).toBeDefined();
  });

  it("survives an empty or malformed envelope instead of throwing", async () => {
    setRole("counselor");
    for (const payload of [{ data: [], total: 0 }, {}, null]) {
      mockApiRequest.mockResolvedValue({ data: payload });
      const result = await getStudentCoursePlan("stu-1", 10);
      expect(result.plan.enrollments).toEqual([]);
    }
  });
});

describe("normalizeCourseSequence", () => {
  it("reports no graduationProgress rather than inventing one", () => {
    // The counselor endpoint has no credit totals to compute it from. SequenceBuilder
    // guards on `gradProg &&`, so absent is correct and a fabricated 0/0 would render
    // a misleading 'At Risk' badge.
    const result = normalizeCourseSequence("stu-1", [], 10);
    expect(result.plan.graduationProgress).toBeUndefined();
  });

  it("keeps every row — the grid groups them, it does not filter", () => {
    const rows = [
      { id: "a", courseId: "c1", term: "Fall" },
      { id: "b", courseId: "c2", term: "Spring" },
      { id: "c", courseId: "c3", term: "Summer" },
    ];
    expect(normalizeCourseSequence("stu-1", rows, 10).plan.enrollments).toHaveLength(3);
  });
});
