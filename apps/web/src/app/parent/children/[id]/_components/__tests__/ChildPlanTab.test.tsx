import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tabs } from "@/components/ui/tabs";
import { ChildPlanTab } from "../ChildPlanTab";
import { getChildCoursePlan } from "@/services/graduationPlanService";

jest.mock("@/services/graduationPlanService", () => ({
  getChildCoursePlan: jest.fn(),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d: string) => d }),
}));

const mockGet = getChildCoursePlan as jest.Mock;

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Tabs defaultValue="course-plan">
        <ChildPlanTab studentId="stu-1" />
      </Tabs>
    </QueryClientProvider>,
  );
}

describe("ChildPlanTab", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the goal, current course summary, and planned-ahead items", async () => {
    mockGet.mockResolvedValue({
      target: { universityName: "MIT", major: "Computer Science" },
      approvedPlan: {
        approvedAt: "2026-06-11T00:00:00Z",
        items: [
          { courseCode: "MATH201", courseName: "Geometry", credits: 1, gradeLevel: 11, term: "Fall" },
          { courseCode: "CS101", courseName: "Intro CS", credits: 1, gradeLevel: 12, term: "Spring" },
        ],
      },
      currentCourses: [
        { courseId: "c1", term: "Fall", status: "planned" },
        { courseId: "c2", term: "Fall", status: "in_progress" },
      ],
    });
    renderTab();
    expect(await screen.findByText(/MIT · Computer Science/)).toBeInTheDocument();
    expect(screen.getByText(/2 courses this year/i)).toBeInTheDocument();
    expect(screen.getByText("Geometry")).toBeInTheDocument();
    expect(screen.getByText("Intro CS")).toBeInTheDocument();
  });

  it("shows honest empty states when nothing is set", async () => {
    mockGet.mockResolvedValue({ target: null, approvedPlan: null, currentCourses: [] });
    renderTab();
    expect(await screen.findByText(/no graduation goal set yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no approved graduation plan yet/i)).toBeInTheDocument();
  });
});
