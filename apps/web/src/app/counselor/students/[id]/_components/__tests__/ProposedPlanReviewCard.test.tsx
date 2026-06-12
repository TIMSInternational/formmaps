import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProposedPlanReviewCard } from "../ProposedPlanReviewCard";
import {
  getStudentGraduationPlan,
  reviewGraduationPlan,
} from "@/services/graduationPlanService";

jest.mock("@/services/graduationPlanService", () => ({
  getStudentGraduationPlan: jest.fn(),
  reviewGraduationPlan: jest.fn(),
}));
jest.mock("@/hooks/useCurriculumQueries", () => ({
  useSchoolCourses: jest.fn(() => ({ data: undefined })),
}));

const mockGet = getStudentGraduationPlan as jest.Mock;
const mockReview = reviewGraduationPlan as jest.Mock;

const proposedPlan = {
  id: "gp-1",
  status: "proposed",
  templateKey: "computer-science:most-selective",
  templateLabel: "Computer Science — Most Selective",
  gapReport: [{ category: "World Language", missingCredits: 2, reason: "No language courses" }],
  warnings: [],
  rationale: "Front-loads math depth.",
  totalPlannedCredits: 4,
  submittedAt: "2026-06-11T00:00:00Z",
  reviewNote: null,
  items: [
    { courseId: "c-geo", courseCode: "MATH201", courseName: "Geometry", credits: 1, gradeLevel: 11, term: "Fall", category: "Mathematics", reason: "Depth", source: "depth-track", sortOrder: 0 },
    { courseId: "c-cs", courseCode: "CS101", courseName: "Intro CS", credits: 1, gradeLevel: 12, term: "Spring", category: "Electives", reason: "Depth", source: "depth-track", sortOrder: 1 },
  ],
};

// The counselor course-sequence endpoint returns bare rows — NO plan.gradeLevel.
// The card must take the grade from the studentGradeLevel prop instead.
const coursePlan = {
  plan: undefined,
  recommendations: [],
} as never;

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProposedPlanReviewCard studentId="stu-1" coursePlan={coursePlan} studentGradeLevel={11} />
    </QueryClientProvider>,
  );
}

describe("ProposedPlanReviewCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      plan: proposedPlan,
      target: { universityName: "MIT", major: "Computer Science", templateKey: "computer-science:most-selective" },
    });
    mockReview.mockResolvedValue({ ...proposedPlan, status: "approved" });
  });

  it("renders the proposed plan with target and per-grade summary", async () => {
    renderCard();
    expect(await screen.findByText(/proposed graduation plan/i)).toBeInTheDocument();
    expect(screen.getByText(/MIT · Computer Science/)).toBeInTheDocument();
    expect(screen.getByText(/grade 11/i)).toBeInTheDocument();
    expect(screen.getByText(/grade 12/i)).toBeInTheDocument();
  });

  it("renders nothing when there is no proposed plan", async () => {
    mockGet.mockResolvedValue({ plan: { ...proposedPlan, status: "draft" }, target: null });
    const { container } = renderCard();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(container.querySelector("section, [data-testid]")).toBeNull();
    expect(screen.queryByText(/proposed graduation plan/i)).not.toBeInTheDocument();
  });

  it("approve asks for confirmation stating the current-grade course count", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));
    // 1 of the 2 items is grade 11 (the student's current grade)
    expect(await screen.findByText(/adds 1 planned course/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm approval/i }));
    await waitFor(() =>
      expect(mockReview).toHaveBeenCalledWith("stu-1", { status: "approved" }),
    );
  });

  it("reject requires a note", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /^reject$/i }));
    const submit = await screen.findByRole("button", { name: /send back to student/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/what should change/i), {
      target: { value: "Too many honors" },
    });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mockReview).toHaveBeenCalledWith("stu-1", { status: "rejected", note: "Too many honors" }),
    );
  });

  it("expands the full diff view with rationale and gaps", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /view full plan/i }));
    expect(await screen.findByText("Geometry")).toBeInTheDocument();
    expect(screen.getByText(/front-loads math depth/i)).toBeInTheDocument();
    expect(screen.getByText("World Language")).toBeInTheDocument();
  });
});
