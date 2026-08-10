// Add Course: `department` is required, `description` is not.
//
// WHY THIS TEST EXISTS
//
// `SchoolCourse.department` is NOT NULL in the schema, but the form validated only
// code and name, so submitting with the field blank stored the empty string. NULL
// would have been rejected; "" is not, so the database never complained — and the
// course then fell out of every view that buckets by department (the Departments
// stat card, the department filter, the pathway/prerequisite views).
//
// Measured in production 2026-08-10: 1 of 128 courses had a blank department, and
// that one was created through this form minutes earlier. Every other course had a
// real value. So the form was the only leak, and this pins it shut.
//
// `description` is deliberately NOT required: 72 of those same 128 courses have
// none, so it is genuinely optional and requiring it would invent a rule the data
// contradicts. That asymmetry is the point of the test — it is easy to "tidy up"
// a form by marking every empty field required, and that would be wrong here.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CoursesPanel } from "../CoursesPanel";
import { useSchoolCourses, useCreateSchoolCourse, useDeleteSchoolCourse } from "@/hooks/useCurriculumQueries";
import { toast } from "sonner";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
// CoursesPanel renders child dialogs (PrereqAnalysisDialog, the AI-import flow)
// that call further hooks from this module, so the mock has to cover the whole
// surface — mocking only the three this test drives makes the render throw on an
// unrelated child and every assertion fail for the wrong reason.
const idleQuery = () => ({ data: undefined, isLoading: false, isPending: false, mutate: jest.fn(), mutateAsync: jest.fn() });
jest.mock("@/hooks/useCurriculumQueries", () => ({
  useSchoolCourses: jest.fn(),
  useCreateSchoolCourse: jest.fn(),
  useDeleteSchoolCourse: jest.fn(),
  useUpdateSchoolCourse: jest.fn(() => idleQuery()),
  useImportSchoolCourses: jest.fn(() => idleQuery()),
  useAvailableCourses: jest.fn(() => idleQuery()),
  useUpdatePrerequisites: jest.fn(() => idleQuery()),
  usePrerequisiteCheck: jest.fn(() => idleQuery()),
  usePrerequisiteChain: jest.fn(() => idleQuery()),
  useRecognizeCourses: jest.fn(() => idleQuery()),
  useRecognizeAllUnmapped: jest.fn(() => idleQuery()),
  useApplyAIMapping: jest.fn(() => idleQuery()),
  useCoursePathways: jest.fn(() => idleQuery()),
  useAnalyzePrerequisites: jest.fn(() => idleQuery()),
  useApplyPrereqSuggestions: jest.fn(() => idleQuery()),
  useFrameworks: jest.fn(() => idleQuery()),
  useFrameworkCourses: jest.fn(() => idleQuery()),
  useUpdateFrameworks: jest.fn(() => idleQuery()),
  useUpdateFrameworkCourse: jest.fn(() => idleQuery()),
  curriculumKeys: { all: ["curriculum"], courses: () => ["curriculum", "courses"] },
}));

const mockCourses = useSchoolCourses as jest.Mock;
const mockCreate = useCreateSchoolCourse as jest.Mock;
const mockDelete = useDeleteSchoolCourse as jest.Mock;
const mockToastError = toast.error as jest.Mock;

// Two existing departments so the datalist has something to offer.
const EXISTING = [
  { id: "c1", code: "MATH-101", name: "Algebra I", department: "Mathematics", credits: 1, gradeLevels: [9], status: "active", isActive: true },
  { id: "c2", code: "SCI-101", name: "Biology", department: "Science", credits: 1, gradeLevels: [9], status: "active", isActive: true },
];

let mutate: jest.Mock;

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CoursesPanel />
    </QueryClientProvider>,
  );
}

const openDialog = async () => {
  // The trigger button and the dialog title share the text "Add Course", so match
  // the dialog by ROLE — getByText finds both and throws.
  fireEvent.click(screen.getByRole("button", { name: /add course/i }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
};

// Queried by PLACEHOLDER, not by label: this form renders <Label> next to <Input>
// with no htmlFor/id pairing, so getByLabelText finds nothing. That is a real
// accessibility gap — a screen reader cannot associate these labels either — but
// wiring every field up is a wider change than this fix, so it is left to a
// follow-up rather than smuggled in here.
const type = (placeholder: RegExp, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

beforeEach(() => {
  jest.clearAllMocks();
  mutate = jest.fn();
  mockCourses.mockReturnValue({ data: { data: EXISTING, total: EXISTING.length }, isLoading: false });
  mockCreate.mockReturnValue({ mutate, isPending: false });
  mockDelete.mockReturnValue({ mutate: jest.fn(), isPending: false });
});

describe("Add Course — required fields", () => {
  it("REFUSES to submit with a blank department, and says so", async () => {
    renderPanel();
    await openDialog();
    type(/MATH-101/, "ART-101");
    type(/Introduction to Algebra/, "Drawing I");
    // department deliberately left blank — the exact input that produced the one
    // bad row in production.
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));

    expect(mutate).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/department/i));
  });

  it("submits when department is filled, and sends it through", async () => {
    renderPanel();
    await openDialog();
    type(/MATH-101/, "ART-101");
    type(/Introduction to Algebra/, "Drawing I");
    type(/e\.g\. /, "Arts");
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));

    expect(mockToastError).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ART-101", name: "Drawing I", department: "Arts" }),
      expect.anything(),
    );
  });

  it("does NOT require a description — 72 of 128 real courses have none", async () => {
    renderPanel();
    await openDialog();
    type(/MATH-101/, "ART-102");
    type(/Introduction to Algebra/, "Drawing II");
    type(/e\.g\. /, "Arts");
    // description untouched
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));

    expect(mockToastError).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalled();
  });

  it("rejects whitespace-only input — ' ' is as empty as ''", async () => {
    renderPanel();
    await openDialog();
    type(/MATH-101/, "ART-103");
    type(/Introduction to Algebra/, "Drawing III");
    type(/e\.g\. /, "   ");
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));

    expect(mutate).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalled();
  });

  it("offers the school's existing departments so 'Math' is not typed beside 'Mathematics'", async () => {
    renderPanel();
    await openDialog();
    const list = document.getElementById("course-department-options");
    expect(list).not.toBeNull();
    const values = Array.from(list!.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    expect(values).toEqual(expect.arrayContaining(["Mathematics", "Science"]));
  });
});
