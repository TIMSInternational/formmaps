import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PathwaysPanel } from "../PathwaysPanel";
import {
  getCoursePathways,
  getSchoolCourses,
  updatePrerequisites,
} from "@/services/curriculumService";

jest.mock("@/services/curriculumService", () => ({
  getCoursePathways: jest.fn(),
  getSchoolCourses: jest.fn(),
  updatePrerequisites: jest.fn(),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockPathways = getCoursePathways as jest.Mock;
const mockCatalog = getSchoolCourses as jest.Mock;
const mockUpdate = updatePrerequisites as jest.Mock;

const PATHWAYS = {
  truncated: false,
  groups: [
    {
      department: "Math",
      chains: [
        [
          { courseId: "c1", code: "ALG1", name: "Algebra I", isHonors: false },
          { courseId: "c2", code: "ALG2", name: "Algebra II", isHonors: false },
          { courseId: "c3", code: "CALC", name: "Calculus", isHonors: true },
        ],
      ],
    },
    {
      department: "Science",
      chains: [
        [
          { courseId: "c4", code: "BIO1", name: "Biology I", isHonors: false },
          { courseId: "c5", code: "BIO2", name: "Biology II", isHonors: false },
        ],
      ],
    },
  ],
};

const CATALOG = {
  data: [
    { id: "c1", code: "ALG1", name: "Algebra I", department: "Math", credits: 1, gradeLevels: [9], prerequisites: [], enrollmentCount: 0, status: "active" },
    { id: "c2", code: "ALG2", name: "Algebra II", department: "Math", credits: 1, gradeLevels: [10], prerequisites: ["ALG1"], enrollmentCount: 0, status: "active" },
    { id: "c3", code: "CALC", name: "Calculus", department: "Math", credits: 1, gradeLevels: [11], prerequisites: ["ALG2"], enrollmentCount: 0, status: "active" },
    { id: "c6", code: "GEO", name: "Geometry", department: "Math", credits: 1, gradeLevels: [10], prerequisites: [], enrollmentCount: 0, status: "active" },
  ],
  total: 4, page: 1, limit: 500, totalPages: 1,
};

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <PathwaysPanel />
    </QueryClientProvider>,
  );
}

describe("PathwaysPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalog.mockResolvedValue(CATALOG);
    mockUpdate.mockResolvedValue(undefined);
  });

  it("renders department-grouped chains with honors badge", async () => {
    mockPathways.mockResolvedValue(PATHWAYS);
    renderPanel();

    expect(await screen.findByText("Math")).toBeInTheDocument();
    expect(screen.getByText("Science")).toBeInTheDocument();
    expect(screen.getByText("ALG1")).toBeInTheDocument();
    expect(screen.getByText("ALG2")).toBeInTheDocument();
    expect(screen.getByText("CALC")).toBeInTheDocument();
    expect(screen.getByText("BIO2")).toBeInTheDocument();
    expect(screen.getByText("Honors")).toBeInTheDocument();
    // No truncation warning for a complete graph
    expect(screen.queryByText(/only the first 200 pathways/i)).not.toBeInTheDocument();
  });

  it("shows the truncation warning when the graph was capped", async () => {
    mockPathways.mockResolvedValue({ ...PATHWAYS, truncated: true });
    renderPanel();

    expect(await screen.findByText(/only the first 200 pathways/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no prereq edges", async () => {
    mockPathways.mockResolvedValue({ truncated: false, groups: [] });
    renderPanel();

    expect(await screen.findByText("No pathways yet")).toBeInTheDocument();
    expect(screen.getByText(/derived from course prerequisites/i)).toBeInTheDocument();
  });

  it("shows an error state with retry", async () => {
    mockPathways.mockRejectedValueOnce(new Error("boom"));
    mockPathways.mockResolvedValueOnce(PATHWAYS);
    renderPanel();

    expect(await screen.findByText(/failed to load pathways/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Math")).toBeInTheDocument();
  });

  it("clicking a course opens the edit dialog seeded with its current prerequisites", async () => {
    mockPathways.mockResolvedValue(PATHWAYS);
    renderPanel();

    fireEvent.click(await screen.findByText("CALC"));

    expect(await screen.findByText(/edit prerequisites/i)).toBeInTheDocument();
    // CALC's current prereq ALG2 appears as a removable chip
    expect(await screen.findByRole("button", { name: "Remove ALG2" })).toBeInTheDocument();
  });

  it("saving sends the full prerequisite set as courseIds", async () => {
    mockPathways.mockResolvedValue(PATHWAYS);
    renderPanel();

    fireEvent.click(await screen.findByText("CALC"));
    await screen.findByRole("button", { name: "Remove ALG2" });

    // Add GEO from the school-catalog picker
    fireEvent.change(screen.getByPlaceholderText(/search your school catalog/i), { target: { value: "GEO" } });
    fireEvent.click(await screen.findByRole("button", { name: /GEO\b.*Geometry/ }));

    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("c3", {
      prerequisiteRules: [{ type: "AND", courseIds: ["c2", "c6"] }],
      corequisites: [],
    }));
  });

  it("removing a prerequisite chip excludes it from the saved payload", async () => {
    mockPathways.mockResolvedValue(PATHWAYS);
    renderPanel();

    fireEvent.click(await screen.findByText("CALC"));
    fireEvent.click(await screen.findByRole("button", { name: "Remove ALG2" }));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("c3", {
      prerequisiteRules: [{ type: "AND", courseIds: [] }],
      corequisites: [],
    }));
  });
});
