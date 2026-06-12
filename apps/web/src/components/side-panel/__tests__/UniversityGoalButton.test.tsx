import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UniversityGoalButton } from "../UniversityGoalButton";
import {
  getGraduationTarget,
  setGraduationTarget,
} from "@/services/graduationPlanService";

jest.mock("@/services/graduationPlanService", () => ({
  getGraduationTarget: jest.fn(),
  setGraduationTarget: jest.fn(),
}));

const mockGet = getGraduationTarget as jest.Mock;
const mockSet = setGraduationTarget as jest.Mock;

function renderButton() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <UniversityGoalButton
        universityId="u-mit"
        universityName="MIT"
        suggestedMajors={["Computer Science", "Mathematics"]}
      />
    </QueryClientProvider>,
  );
}

describe("UniversityGoalButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue({ universityId: "u-mit", universityName: "MIT", major: "Computer Science", suggested: false });
  });

  it("sets the university as the graduation goal with a major", async () => {
    renderButton();
    fireEvent.click(await screen.findByRole("button", { name: /set as my graduation goal/i }));
    // Inline form appears, prefilled with the first suggested major
    const input = await screen.findByPlaceholderText(/intended major/i);
    expect((input as HTMLInputElement).value).toBe("Computer Science");
    fireEvent.click(screen.getByRole("button", { name: /save goal/i }));
    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith({ universityId: "u-mit", major: "Computer Science" }),
    );
  });

  it("shows the current-goal state when this university is already the goal", async () => {
    mockGet.mockResolvedValue({
      universityId: "u-mit", universityName: "MIT", major: "Computer Science", suggested: false,
    });
    renderButton();
    expect(await screen.findByText(/your graduation goal/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set as my graduation goal/i })).not.toBeInTheDocument();
  });
});
