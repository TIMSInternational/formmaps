import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CoursePlanPage from "@/app/dashboard/course-plan/page";
import {
  getMyCoursePlan,
  addCourseToPlan,
  removeCourseFromPlan,
  getMyChangeRequests,
} from "@/services/coursePlanService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/services/coursePlanService", () => ({
  getMyCoursePlan: jest.fn(),
  addCourseToPlan: jest.fn(),
  removeCourseFromPlan: jest.fn(),
  getMyChangeRequests: jest.fn(),
  cancelChangeRequest: jest.fn(),
}));
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));

const mockPlan = getMyCoursePlan as jest.Mock;
const mockAdd = addCourseToPlan as jest.Mock;
const mockRemove = removeCourseFromPlan as jest.Mock;
const mockCRs = getMyChangeRequests as jest.Mock;
const mockApi = apiRequest as jest.Mock;

const catalog = [
  { id: "c-alg", code: "MATH101", name: "Algebra I", department: "Math", credits: "1", gradeLevels: [9, 10], isHonors: false },
  { id: "c-art", code: "ART101", name: "Studio Art I", department: "Arts", credits: "1", gradeLevels: [9, 10, 11, 12], isHonors: false },
];

describe("Student course plan page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlan.mockResolvedValue({
      plan: {
        gradeLevel: 10,
        totalCreditsEarned: 3,
        enrollments: [{ id: "p1", courseId: "c-alg", term: "Fall", status: "planned" }],
      },
      recommendations: [],
    });
    mockCRs.mockResolvedValue({ data: [], total: 0 });
    mockApi.mockResolvedValue({ success: true, data: { data: catalog } });
    mockAdd.mockResolvedValue(undefined);
    mockRemove.mockResolvedValue(undefined);
  });

  it("renders the plan with course names resolved from the school catalog", async () => {
    render(<CoursePlanPage />);
    expect(await screen.findByText("Algebra I")).toBeInTheDocument();
    expect(screen.getByText(/MATH101/)).toBeInTheDocument();
  });

  it("adds a class from the catalog", async () => {
    render(<CoursePlanPage />);
    await screen.findByText("Studio Art I");
    fireEvent.click(screen.getByRole("button", { name: /add studio art i/i }));
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: "c-art" }),
    );
  });

  it("removes a planned class", async () => {
    render(<CoursePlanPage />);
    await screen.findByText("Algebra I");
    fireEvent.click(screen.getByRole("button", { name: /remove algebra i/i }));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("c-alg"));
  });
});
