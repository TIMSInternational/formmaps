/**
 * Audit 2026-10-09 D6: the graduation search filtered only the 20 rows on screen and the summary cards were computed
 * from that page. The panel now sends the search to the API and shows the API's school-wide summary.
 */
import "@/lib/i18n";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GraduationPanel } from "../GraduationPanel";
import {
  useGraduationRules, useCreateGraduationRules, useUpdateGraduationRules, useAllGraduationProgress,
} from "@/hooks/useGraduationQueries";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/hooks/useGraduationQueries", () => ({
  useGraduationRules: jest.fn(),
  useCreateGraduationRules: jest.fn(),
  useUpdateGraduationRules: jest.fn(),
  useAllGraduationProgress: jest.fn(),
}));
jest.mock("@/hooks/useCurriculumQueries", () => ({ useSchoolCourses: () => ({ data: { data: [] } }) }));

const mockProgress = useAllGraduationProgress as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  (useGraduationRules as jest.Mock).mockReturnValue({ data: null, isLoading: false });
  (useCreateGraduationRules as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useUpdateGraduationRules as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  mockProgress.mockReturnValue({
    data: {
      data: [{ studentId: "u1", studentName: "Ada", gradeLevel: 11, creditsCompleted: 2, creditsRequired: 20, progressPercent: 10, status: "off_track" }],
      total: 1, page: 1, limit: 20, totalPages: 1,
      summary: { total: 340, onTrack: 211, atRisk: 77, offTrack: 52, avgProgress: 68 },
    },
    isLoading: false,
  });
});
afterEach(() => jest.useRealTimers());

it("shows the school-wide summary from the API, not counts of the rows on screen", () => {
  render(<GraduationPanel />);
  expect(screen.getByText("340")).toBeInTheDocument();
  expect(screen.getByText("211")).toBeInTheDocument();
  expect(screen.getByText("77")).toBeInTheDocument();
  expect(screen.getByText("52")).toBeInTheDocument();
  expect(screen.getByText("68%")).toBeInTheDocument();
});

it("sends the search to the API (debounced) and goes back to page 1", () => {
  render(<GraduationPanel />);
  const box = screen.getByPlaceholderText(/search/i);
  fireEvent.change(box, { target: { value: "  zoe " } });
  act(() => { jest.advanceTimersByTime(350); });
  expect(mockProgress).toHaveBeenLastCalledWith(expect.objectContaining({ search: "zoe", page: 1 }));
});
