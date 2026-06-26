import { render, screen, waitFor } from "@testing-library/react";
import { RecommendationsPanel } from "../_components/RecommendationsPanel";
import * as svc from "@/services/vocationalReportService";

jest.mock("@/services/vocationalReportService");
const getRecs = svc.getRecommendations as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it("renders guidance + career matches + industries when ready", async () => {
  getRecs.mockResolvedValue({ locked: false,
    careerMatches: [{ programId: "p1", programTitle: "Engineering", cluster: "STEM", totalScore: 82, confidence: "high", needsBridging: false, bridgingPaths: "" }],
    guidance: { summary: "Your path", recommendedPaths: [{ title: "Engineer", why: "fits" }], strengths: ["analysis"], growthAreas: ["public speaking"], nextSteps: ["talk to counselor"] },
    industries: [{ value: "tech", count: 2 }] });
  render(<RecommendationsPanel evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText("Your path")).toBeInTheDocument());
  expect(screen.getByText(/Engineering/)).toBeInTheDocument();
  expect(screen.getByText(/tech/)).toBeInTheDocument();
  expect(screen.getByText(/talk to counselor/)).toBeInTheDocument();
});

it("shows a locked state when assessments incomplete", async () => {
  getRecs.mockResolvedValue({ locked: true });
  render(<RecommendationsPanel evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText(/complete|finish|unlock/i)).toBeInTheDocument());
});
