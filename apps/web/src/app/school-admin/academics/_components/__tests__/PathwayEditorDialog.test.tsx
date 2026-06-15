import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PathwayEditorDialog } from "../PathwayEditorDialog";
import { useSchoolCourses } from "@/hooks/useCurriculumQueries";
import { updatePrerequisites } from "@/services/curriculumService";

// Mock the React Flow canvas — jsdom can't run @xyflow/react. The stub exposes
// buttons that invoke the dialog's connect/drop callbacks, so the connect→diff→
// save path is still exercised for real.
jest.mock("../PathwayCanvas", () => ({
  COURSE_DRAG_MIME: "application/pathway-course",
  PathwayCanvas: ({ onConnect, onDropCourse, readOnly, edges }: {
    onConnect: (c: { source: string; target: string }) => void;
    onDropCourse: (id: string, p: { x: number; y: number }) => void;
    readOnly: boolean;
    edges: { length: number }[];
  }) => (
    <div data-testid="canvas">
      <span data-testid="edge-count">{edges.length}</span>
      <span data-testid="read-only">{String(readOnly)}</span>
      <button onClick={() => onConnect({ source: "c6", target: "c3" })}>add GEO→CALC</button>
      <button onClick={() => onConnect({ source: "c3", target: "c1" })}>add cycle</button>
      <button onClick={() => onConnect({ source: "c1", target: "c2" })}>add duplicate</button>
      <button onClick={() => onDropCourse("c6", { x: 0, y: 0 })}>drop GEO</button>
    </div>
  ),
}));

jest.mock("@/hooks/useCurriculumQueries", () => ({
  useSchoolCourses: jest.fn(),
  curriculumKeys: {
    pathways: () => ["curriculum", "pathways"],
    schoolCourses: () => ["curriculum", "school-courses"],
  },
}));

jest.mock("@/services/curriculumService", () => ({
  updatePrerequisites: jest.fn(),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { toast } from "sonner";

const mockCourses = useSchoolCourses as jest.Mock;
const mockUpdate = updatePrerequisites as jest.Mock;
const mockToastError = toast.error as jest.Mock;

const CATALOG = [
  { id: "c1", code: "ALG1", name: "Algebra I", department: "Math", credits: 1, gradeLevels: [9], prerequisites: [], corequisites: [], enrollmentCount: 0, status: "active" },
  { id: "c2", code: "ALG2", name: "Algebra II", department: "Math", credits: 1, gradeLevels: [10], prerequisites: ["ALG1"], corequisites: [], enrollmentCount: 0, status: "active" },
  { id: "c3", code: "CALC", name: "Calculus", department: "Math", credits: 1, gradeLevels: [11], prerequisites: ["ALG2"], corequisites: ["CALC-LAB"], enrollmentCount: 0, status: "active" },
  { id: "c6", code: "GEO", name: "Geometry", department: "Math", credits: 1, gradeLevels: [10], prerequisites: [], corequisites: [], enrollmentCount: 0, status: "active" },
];

function mockCatalog(total = CATALOG.length) {
  mockCourses.mockReturnValue({
    data: { data: CATALOG, total, page: 1, limit: 500, totalPages: 1 },
    isLoading: false,
    isError: false,
  });
}

function renderDialog(onClose = jest.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PathwayEditorDialog open onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe("PathwayEditorDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
    mockCatalog();
  });

  it("seeds edges from the catalog and lists unconnected courses in the palette", () => {
    renderDialog();
    // ALG1→ALG2, ALG2→CALC = 2 edges
    expect(screen.getByTestId("edge-count").textContent).toBe("2");
    // GEO is unconnected → palette
    expect(screen.getByText("GEO")).toBeInTheDocument();
    // Save disabled and labelled "Saved" when there are no changes
    const save = screen.getByRole("button", { name: /^Saved$/ });
    expect(save).toBeDisabled();
  });

  it("adds a prerequisite and saves only the changed course (coreqs preserved)", async () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByText("add GEO→CALC"));

    expect(screen.getByTestId("edge-count").textContent).toBe("3");
    const save = screen.getByRole("button", { name: /^Save 1$/ });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith("c3", {
      prerequisiteRules: [{ type: "AND", courseIds: ["c2", "c6"] }],
      corequisites: ["CALC-LAB"],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("rejects a connection that would create a cycle", () => {
    renderDialog();
    fireEvent.click(screen.getByText("add cycle"));
    expect(mockToastError).toHaveBeenCalled();
    expect(screen.getByTestId("edge-count").textContent).toBe("2"); // unchanged
    expect(screen.getByRole("button", { name: /^Saved$/ })).toBeDisabled();
  });

  it("rejects a duplicate prerequisite", () => {
    renderDialog();
    fireEvent.click(screen.getByText("add duplicate"));
    expect(mockToastError).toHaveBeenCalled();
    expect(screen.getByTestId("edge-count").textContent).toBe("2");
  });

  it("prompts before discarding unsaved changes on close", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByText("add GEO→CALC"));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled(); // confirm returned false
    confirmSpy.mockRestore();
  });

  it("opens read-only when the catalog did not load completely", () => {
    mockCatalog(999); // total >> loaded
    renderDialog();
    expect(screen.getByText(/read-only to avoid wiping prerequisites/i)).toBeInTheDocument();
    expect(screen.getByTestId("read-only").textContent).toBe("true");
    // Adding an edge is a no-op in read-only mode
    fireEvent.click(screen.getByText("add GEO→CALC"));
    expect(screen.getByTestId("edge-count").textContent).toBe("2");
  });
});
