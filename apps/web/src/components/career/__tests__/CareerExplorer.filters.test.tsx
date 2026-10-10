/**
 * audit 2026-10-09 C16: career filters must actually filter (client-side — the API has no filter
 * params), and an all-zero TIMS result must show an empty state instead of an endless skeleton.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import CareerExplorer from "../CareerExplorer";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";

const tFn = (k: string, d?: unknown) => (typeof d === "string" ? d : k);
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: tFn, i18n: { language: "en" } }) }));
jest.mock("@/store/useGlobalStore", () => ({ useGlobalStore: () => ({ user: { id: "u1" } }) }));
jest.mock("@/hooks/useAssessmentQueries", () => ({
  useAssessmentProgress: () => ({ isLoading: false, data: { overallCompletion: { percentageComplete: 100 }, personalityAssessment: { status: "completed" } } }),
}));
jest.mock("@/hooks/useTimsQueries", () => ({ useTimsCareerScoring: jest.fn() }));
jest.mock("@/hooks/useCareerQueries", () => ({ useCareerList: () => ({ data: { careers: [] }, isLoading: false }) }));
jest.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ favorites: [], toggleFavorite: jest.fn() }) }));
jest.mock("@/components/side-panel/SidePanel", () => ({ useSidePanel: () => ({ openPanel: jest.fn() }) }));
jest.mock("@/components/side-panel/CareerDetailPanel", () => ({ CareerDetailPanel: () => null }));
jest.mock("@/components/assessments/AssessmentGate", () => ({ AssessmentGate: () => <div>gate</div> }));
jest.mock("@/components/filters/ActiveFilterPills", () => ({ ActiveFilterPills: () => null }));
jest.mock("@/components/empty-state/EmptyState", () => ({ EmptyState: ({ title }: any) => <div data-testid="empty">{title}</div> }));
jest.mock("../SkeletonCareerCard", () => ({ __esModule: true, default: () => <div data-testid="skeleton" /> }));
jest.mock("../CareerCard", () => ({ __esModule: true, default: ({ career }: any) => <div data-testid="card">{career.title.en}</div> }));
jest.mock("motion/react", () => ({ motion: { div: ({ children }: any) => <div>{children}</div> } }));
jest.mock("../CareerFilters", () => ({
  CareerFilters: ({ onChange, fieldOptions }: any) => (
    <div>
      <span data-testid="fields">{fieldOptions.join("|")}</span>
      <button onClick={() => onChange({ search: "nurs" })}>search</button>
      <button onClick={() => onChange({ industry: "Engineering" })}>field</button>
      <button onClick={() => onChange({ sort: "title" })}>title</button>
    </div>
  ),
}));

const mockTims = useTimsCareerScoring as jest.Mock;
const sc = (programId: string, programTitle: string, cluster: string, totalScore: number) => ({ programId, programTitle, cluster, totalScore });
const cards = () => screen.queryAllByTestId("card").map((n) => n.textContent);

const LIST = [
  sc("p1", "Civil Engineer", "Engineering", 90),
  sc("p2", "Nursing", "Health_Sciences_and_Medicine", 80),
  sc("p3", "Architect", "Engineering", 70),
];

it("search, field and sort filter the scored list client-side", () => {
  mockTims.mockReturnValue({ isLoading: false, data: { data: { careers: LIST } } });
  render(<CareerExplorer />);
  expect(cards()).toEqual(["Civil Engineer", "Nursing", "Architect"]);
  expect(screen.getByTestId("fields").textContent).toBe("Engineering|Health Sciences and Medicine");

  fireEvent.click(screen.getByText("search"));
  expect(cards()).toEqual(["Nursing"]);

  fireEvent.click(screen.getByText("field"));
  expect(cards()).toEqual(["Civil Engineer", "Architect"]);

  fireEvent.click(screen.getByText("title"));
  expect(cards()).toEqual(["Architect", "Civil Engineer", "Nursing"]);
});

it("all-zero TIMS scores show the empty state, not an endless skeleton", () => {
  mockTims.mockReturnValue({ isLoading: false, data: { data: { careers: LIST.map((c) => ({ ...c, totalScore: 0 })) } } });
  render(<CareerExplorer />);
  expect(screen.queryAllByTestId("skeleton")).toHaveLength(0);
  expect(screen.getByTestId("empty").textContent).toBe("career.explorer.scoresPendingTitle");
});
