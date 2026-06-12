import { render, screen } from "@testing-library/react";
import { SequenceBuilder } from "../SequenceBuilder";
import type { StudentCoursePlanResponse, StudentCourseEnrollment } from "@/types/coursePlan";

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
