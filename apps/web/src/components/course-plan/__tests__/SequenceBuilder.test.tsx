import { render, screen } from "@testing-library/react";
import { SequenceBuilder } from "../SequenceBuilder";
import type { StudentCoursePlanResponse, StudentCourseEnrollment } from "@/types/coursePlan";
import { optimisticId } from "@/hooks/useOptimisticCache";

jest.mock("@/hooks/useCurriculumQueries", () => ({
  useSchoolCourses: jest.fn(() => ({ data: undefined })),
}));

const baseEnrollment: StudentCourseEnrollment = {
  id: "e1",
  courseId: "c-alg",
  courseCode: "MATH101",
  courseName: "Algebra I",
  category: "Mathematics",
  credits: 1,
  gradeLevel: 9,
  semester: "Fall",
  status: "planned",
};

const planData: StudentCoursePlanResponse = {
  plan: {
    studentId: "stu-1",
    gradeLevel: 9,
    enrollments: [baseEnrollment],
    graduationProgress: {
      totalCreditsEarned: 1,
      totalCreditsRequired: 24,
      percentage: 4,
      isOnTrack: true,
    },
    byGrade: {},
  },
  recommendations: [],
};

const draftItem: StudentCourseEnrollment = {
  id: "draft-1",
  courseId: "c-geo",
  courseCode: "MATH201",
  courseName: "Geometry",
  category: "Mathematics",
  credits: 1,
  gradeLevel: 10,
  semester: "Fall",
  status: "draft_proposed",
};

describe("SequenceBuilder draft/readOnly extensions", () => {
  it("renders extraEnrollments with a yellow Proposed pill", () => {
    render(
      <SequenceBuilder
        planData={planData}
        isLoading={false}
        mode="student"
        readOnly
        extraEnrollments={[draftItem]}
      />,
    );
    expect(screen.getByText("Geometry")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
  });

  it("hides add and remove affordances when readOnly", () => {
    render(
      <SequenceBuilder
        planData={planData}
        isLoading={false}
        mode="student"
        readOnly
        extraEnrollments={[draftItem]}
      />,
    );
    expect(screen.queryByText("Request")).not.toBeInTheDocument();
    expect(screen.queryByText("Add")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/request removal/i)).not.toBeInTheDocument();
  });

  it("still shows add affordances when not readOnly", () => {
    render(
      <SequenceBuilder planData={planData} isLoading={false} mode="student" />,
    );
    expect(screen.getAllByText("Request").length).toBeGreaterThan(0);
  });

  it("draft items appear in their grade/semester slot", () => {
    render(
      <SequenceBuilder
        planData={planData}
        isLoading={false}
        mode="student"
        readOnly
        extraEnrollments={[draftItem]}
      />,
    );
    // Existing planned rows render unchanged next to the draft addition
    expect(screen.getByText("Algebra I")).toBeInTheDocument();
    expect(screen.getByText(/MATH201/)).toBeInTheDocument();
  });
});

// formmaps#111. An optimistic row carries a client-minted placeholder id, not a plan-row
// id, so a Remove click on one issues DELETE .../course-plan/courses/optimistic-… — a
// guaranteed 404 whose toast is indistinguishable from a real failure.
describe("SequenceBuilder does not offer Remove on a row that is still in flight", () => {
  const pendingRow: StudentCourseEnrollment = {
    ...baseEnrollment,
    id: optimisticId(),
    courseId: "c-bio",
    courseCode: "BIO101",
    courseName: "Biology",
  };

  const planWith = (enrollments: StudentCourseEnrollment[]): StudentCoursePlanResponse => ({
    ...planData,
    plan: { ...planData.plan, enrollments },
  });

  it("hides the remove control for an optimistic row", () => {
    render(
      <SequenceBuilder
        planData={planWith([pendingRow])}
        isLoading={false}
        mode="counselor"
        onCounselorRemove={jest.fn()}
      />,
    );
    // The row itself is on screen — that is the whole point of the optimistic insert.
    expect(screen.getByText("Biology")).toBeInTheDocument();
    expect(screen.queryByTitle("Remove course")).not.toBeInTheDocument();
  });

  it("still offers it for a real, server-issued row", () => {
    // Negative control: proves the assertion above is not passing because the control
    // is missing for some unrelated reason.
    render(
      <SequenceBuilder
        planData={planWith([baseEnrollment])}
        isLoading={false}
        mode="counselor"
        onCounselorRemove={jest.fn()}
      />,
    );
    expect(screen.getByTitle("Remove course")).toBeInTheDocument();
  });

  it("offers it for the real row and not the pending one when both are on screen", () => {
    render(
      <SequenceBuilder
        planData={planWith([baseEnrollment, pendingRow])}
        isLoading={false}
        mode="counselor"
        onCounselorRemove={jest.fn()}
      />,
    );
    expect(screen.getAllByTitle("Remove course")).toHaveLength(1);
  });
});
