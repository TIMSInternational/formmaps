import { getStudentCoursePlan } from "../coursePlanService";
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
