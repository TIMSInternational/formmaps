import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CoursePlanPage from "@/app/dashboard/course-plan/page";
import {
  getMyCoursePlan,
  addCourseToPlan,
  removeCourseFromPlan,
  getMyChangeRequests,
  getMyCourseRecommendations,
} from "@/services/coursePlanService";
import {
  getGraduationTarget,
  getMyGraduationPlan,
  getSupplementalCourses,
  submitGraduationPlan,
} from "@/services/graduationPlanService";
import { getMyCourseEligibility } from "@/services/curriculumService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/services/coursePlanService", () => ({
  getMyCoursePlan: jest.fn(),
  addCourseToPlan: jest.fn(),
  removeCourseFromPlan: jest.fn(),
  getMyChangeRequests: jest.fn(),
  cancelChangeRequest: jest.fn(),
  getMyCourseRecommendations: jest.fn(),
}));
jest.mock("@/services/graduationPlanService", () => ({
  getGraduationTarget: jest.fn(),
  setGraduationTarget: jest.fn(),
  generateGraduationPlan: jest.fn(),
  getMyGraduationPlan: jest.fn(),
  submitGraduationPlan: jest.fn(),
  discardGraduationDraft: jest.fn(),
  getSupplementalCourses: jest.fn(),
}));
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
jest.mock("@/hooks/useCurriculumQueries", () => ({
  ...jest.requireActual("@/hooks/useCurriculumQueries"),
  useSchoolCourses: jest.fn(() => ({ data: undefined })),
}));
jest.mock("@/services/curriculumService", () => ({
  ...jest.requireActual("@/services/curriculumService"),
  getMyCourseEligibility: jest.fn(),
}));

const mockPlan = getMyCoursePlan as jest.Mock;
const mockAdd = addCourseToPlan as jest.Mock;
const mockRemove = removeCourseFromPlan as jest.Mock;
const mockCRs = getMyChangeRequests as jest.Mock;
const mockRecs = getMyCourseRecommendations as jest.Mock;
const mockTarget = getGraduationTarget as jest.Mock;
const mockGradPlan = getMyGraduationPlan as jest.Mock;
const mockSupplemental = getSupplementalCourses as jest.Mock;
const mockSubmit = submitGraduationPlan as jest.Mock;
const mockApi = apiRequest as jest.Mock;
const mockEligibility = getMyCourseEligibility as jest.Mock;

const catalog = [
  { id: "c-alg", code: "MATH101", name: "Algebra I", department: "Math", credits: "1", gradeLevels: [9, 10], isHonors: false },
  { id: "c-art", code: "ART101", name: "Studio Art I", department: "Arts", credits: "1", gradeLevels: [9, 10, 11, 12], isHonors: false },
];

const draftPlan = {
  id: "gp-1",
  status: "draft",
  templateKey: "computer-science:most-selective",
  templateLabel: "Computer Science — Most Selective",
  gapReport: [{ category: "World Language", missingCredits: 2, reason: "Catalog has no language courses" }],
  warnings: [],
  rationale: "This plan front-loads math depth for MIT CS.",
  totalPlannedCredits: 6,
  submittedAt: null,
  reviewNote: null,
  items: [
    {
      courseId: "c-geo", courseCode: "MATH201", courseName: "Geometry", credits: 1,
      gradeLevel: 10, term: "Fall", category: "Mathematics", reason: "Math depth", source: "depth-track", sortOrder: 0,
    },
  ],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CoursePlanPage />
    </QueryClientProvider>,
  );
}

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
    mockRecs.mockResolvedValue({ data: [], locked: false });
    mockTarget.mockResolvedValue(null);
    mockGradPlan.mockResolvedValue(null);
    mockSupplemental.mockResolvedValue([]);
    mockApi.mockResolvedValue({ success: true, data: { data: catalog } });
    mockAdd.mockResolvedValue(undefined);
    mockRemove.mockResolvedValue(undefined);
    mockSubmit.mockResolvedValue(draftPlan);
    mockEligibility.mockResolvedValue([]);
  });

  it("renders the plan with course names resolved from the school catalog", async () => {
    renderPage();
    expect(await screen.findByText("Algebra I")).toBeInTheDocument();
    expect(screen.getByText(/MATH101/)).toBeInTheDocument();
  });

  it("adds a class from the catalog", async () => {
    renderPage();
    await screen.findByText("Studio Art I");
    fireEvent.click(screen.getByRole("button", { name: /add studio art i/i }));
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ courseId: "c-art" }));
  });

  it("removes a planned class", async () => {
    renderPage();
    await screen.findByText("Algebra I");
    fireEvent.click(screen.getByRole("button", { name: /remove algebra i/i }));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("c-alg"));
  });

  it("shows an empty-goal card inviting the student to choose a goal", async () => {
    renderPage();
    expect(await screen.findByText(/where do you want to graduate to/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose your goal/i })).toBeInTheDocument();
  });

  it("shows the card-level lock when assessments are incomplete — manual planning stays usable", async () => {
    mockRecs.mockResolvedValue({
      data: [],
      locked: true,
      completion: { allDone: false, liaCompleted: 2, pcaCompleted: false, evalCompleted: 0, evalTotal: 1 },
    });
    renderPage();
    expect(await screen.findByText(/unlock your personalized graduation plan/i)).toBeInTheDocument();
    // Manual planning still available below the lock
    expect(await screen.findByText("Algebra I")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add studio art i/i })).toBeInTheDocument();
  });

  it("renders a draft plan with proposed items, rationale, and gap report", async () => {
    mockTarget.mockResolvedValue({
      universityName: "MIT", universityId: "u-mit", major: "Computer Science",
      templateLabel: "Computer Science — Most Selective", suggested: false,
    });
    mockGradPlan.mockResolvedValue(draftPlan);
    renderPage();
    expect(await screen.findByText(/draft plan ready/i)).toBeInTheDocument();
    expect(screen.getByText("Geometry")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
    expect(screen.getByText(/front-loads math depth/i)).toBeInTheDocument();
    expect(screen.getByText("World Language")).toBeInTheDocument();
  });

  it("submits the draft to the counselor", async () => {
    mockTarget.mockResolvedValue({
      universityName: "MIT", universityId: "u-mit", major: "Computer Science", suggested: false,
    });
    mockGradPlan.mockResolvedValue(draftPlan);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /submit to counselor/i }));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
  });

  it("shows the submitted banner read-only when the plan is proposed", async () => {
    mockTarget.mockResolvedValue({
      universityName: "MIT", universityId: "u-mit", major: "Computer Science", suggested: false,
    });
    mockGradPlan.mockResolvedValue({ ...draftPlan, status: "proposed" });
    renderPage();
    expect(await screen.findByText(/your counselor is reviewing this plan/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit to counselor/i })).not.toBeInTheDocument();
  });

  it("shows the counselor note and revise CTA when rejected", async () => {
    mockTarget.mockResolvedValue({
      universityName: "MIT", universityId: "u-mit", major: "Computer Science", suggested: false,
    });
    mockGradPlan.mockResolvedValue({ ...draftPlan, status: "rejected", reviewNote: "Too many honors at once" });
    renderPage();
    expect(await screen.findByText(/too many honors at once/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revise & regenerate/i })).toBeInTheDocument();
  });

  it("shows assessment-based suggestion chips in the catalog section", async () => {
    mockRecs.mockResolvedValue({
      data: [{ id: "g1", title: "Intro to Programming", matchScore: 80 }],
      locked: false,
    });
    renderPage();
    expect(await screen.findByText(/suggested for you/i)).toBeInTheDocument();
    expect(screen.getByText("Intro to Programming")).toBeInTheDocument();
  });

  it("shows the supplemental rail with gap badges when a target is set", async () => {
    mockTarget.mockResolvedValue({
      universityName: "MIT", universityId: "u-mit", major: "Computer Science", suggested: false,
    });
    mockSupplemental.mockResolvedValue([
      { id: "s1", title: "Spanish for Beginners", provider: "Coursera", category: "Language", rating: 4.7, matchScore: 30, fillsGap: "world language", reason: "Fills the world language gap." },
    ]);
    renderPage();
    expect(await screen.findByText("Spanish for Beginners")).toBeInTheDocument();
    expect(screen.getByText(/fills: world language gap/i)).toBeInTheDocument();
  });

  it("shows a Needs-prereq badge on ineligible catalog rows", async () => {
    mockEligibility.mockResolvedValue([
      { courseId: "c-alg", courseCode: "MATH101", eligible: true, missing: [] },
      { courseId: "c-art", courseCode: "ART101", eligible: false, missing: ["ART100"] },
    ]);
    renderPage();
    expect(await screen.findByText(/needs ART100/i)).toBeInTheDocument();
  });
});
