/**
 * Audit 2026-10-09 E2: the counselor's student page has the school admin's "Results & Answers" view,
 * and the AI course recommendations load only once the Course Plan tab is opened.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import CounselorStudentDetailPage from "../page";
import { useStudentRecommendations } from "@/hooks/useStudentDetailData";

jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const inst = createTestI18n("en");
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: (ns?: string) => ({ t: inst.getFixedT(null, ns ?? "common"), i18n: inst }),
  };
});
jest.mock("next/navigation", () => ({ useParams: () => ({ id: "stu-1" }), useRouter: () => ({ push: jest.fn() }) }));

function mockQ(data: unknown = undefined) { return { data, isLoading: false, error: null }; }
function mockM() { return { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }; }
jest.mock("@/hooks/useSchoolProfileQueries", () => ({
  useMyCounselorStudentDetail: () => ({ data: { id: "stu-1", name: "Ana Ruiz", gradeLevel: 11 }, isLoading: false, error: null }),
}));
jest.mock("@/hooks/useCounselorNotesQueries", () => ({ useStudentNotes: () => mockQ(), useCreateNote: mockM, useDeleteNote: mockM }));
jest.mock("@/hooks/useCoursePlanQueries", () => ({
  useStudentCoursePlan: () => mockQ(), useCounselorAddCourse: mockM, useCounselorRemoveCourse: mockM,
  useStudentChangeRequests: () => mockQ(), useReviewChangeRequest: mockM,
}));
jest.mock("@/hooks/useStudentDetailData", () => ({
  useStudentRecommendations: jest.fn(() => ({ data: undefined })),
  useStudentAcademicGaps: () => mockQ(), useStudentTranscript: () => mockQ(), useStudentGpa: () => mockQ(),
}));
jest.mock("@/hooks/useAssessmentQueries", () => ({ useAssessmentProgress: () => mockQ(), useMILHistory: () => mockQ(), useEvaluationGroups: () => mockQ() }));
jest.mock("@/components/school-admin/InviteParentPanel", () => ({ InviteParentPanel: () => <div /> }));
jest.mock("@/app/school-admin/users/[id]/_components/record-tab", () => ({
  RecordTab: ({ studentId, studentName }: { studentId: string; studentName: string }) => <div data-testid="record-tab">{studentId}|{studentName}</div>,
}));
jest.mock("../_components/StudentProfileHeader", () => ({ StudentProfileHeader: () => <div /> }));
jest.mock("../_components/StudentStatCards", () => ({ StudentStatCards: () => <div /> }));
jest.mock("../_components/NotesTab", () => ({ NotesTab: () => <div /> }));
jest.mock("../_components/AssessmentsTab", () => ({ AssessmentsTab: () => <div /> }));
jest.mock("../_components/GradesTab", () => ({ GradesTab: () => <div /> }));
jest.mock("../_components/CoursePlanTab", () => ({ CoursePlanTab: () => <div /> }));

const recs = useStudentRecommendations as jest.Mock;
// Radix tabs switch on mousedown (pointer), not click.
const open = (name: RegExp) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

beforeEach(() => recs.mockClear());

it("has a Results & Answers tab that shows the student's record", () => {
  render(<CounselorStudentDetailPage />);
  expect(screen.queryByTestId("record-tab")).toBeNull();
  open(/results & answers/i);
  expect(screen.getByTestId("record-tab")).toHaveTextContent("stu-1|Ana Ruiz");
});

it("loads AI course recommendations only after the Course Plan tab is opened, and keeps them", () => {
  render(<CounselorStudentDetailPage />);
  expect(recs).toHaveBeenCalled();
  expect(recs.mock.calls.every(([, enabled]) => enabled === false)).toBe(true);
  open(/course plan/i);
  expect(recs).toHaveBeenLastCalledWith("stu-1", true);
  open(/results & answers/i);
  expect(recs).toHaveBeenLastCalledWith("stu-1", true);
});
