import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RecommendationList from "../RecommendationList";
import { RecommendationRequest } from "@/services/recommendationService";

const getRecommendationLetterUrl = jest.fn();
jest.mock("@/services/recommendationService", () => ({
  getRecommendationLetterUrl: (...args: unknown[]) => getRecommendationLetterUrl(...args),
}));

const base: RecommendationRequest = {
  id: "r1",
  studentId: "s1",
  recommenderId: "t1",
  status: "requested",
  relationship: "Math teacher",
  requestMessage: "Please",
  declineReason: null,
  dueDate: null,
  submittedAt: null,
  letterFileKey: null,
  letterFileName: null,
  letterUploadedAt: null,
  createdDate: "2026-06-18T00:00:00.000Z",
  recommender: { name: "Ms. Teach", email: "t@s.dev" },
};

beforeEach(() => getRecommendationLetterUrl.mockReset());

describe("RecommendationList tracker", () => {
  it("shows the lifecycle timeline for an in-progress request (no download button)", () => {
    render(<RecommendationList requests={[{ ...base, status: "in_progress" }]} />);
    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.queryByText("Download letter")).not.toBeInTheDocument();
  });

  it("shows a download button ONLY when submitted with a letter file, and fetches a signed url on click", async () => {
    getRecommendationLetterUrl.mockResolvedValue({ url: "https://signed.example/x.pdf", filename: "x.pdf" });
    render(
      <RecommendationList
        requests={[{ ...base, status: "submitted", letterFileKey: "k", letterFileName: "x.pdf" }]}
      />,
    );
    const btn = screen.getByText("Download letter");
    fireEvent.click(btn);
    await waitFor(() => expect(getRecommendationLetterUrl).toHaveBeenCalledWith("r1"));
  });

  it("does NOT show a download button for a submitted request missing the file key", () => {
    render(<RecommendationList requests={[{ ...base, status: "submitted", letterFileKey: null }]} />);
    expect(screen.queryByText("Download letter")).not.toBeInTheDocument();
  });

  it("renders the decline reason inline for a declined request (no timeline)", () => {
    render(
      <RecommendationList requests={[{ ...base, status: "declined", declineReason: "Too many requests" }]} />,
    );
    expect(screen.getByText(/Too many requests/)).toBeInTheDocument();
    expect(screen.queryByText("In progress")).not.toBeInTheDocument();
  });

  it("renders the empty state when there are no requests", () => {
    render(<RecommendationList requests={[]} />);
    expect(screen.getByText("No requests yet")).toBeInTheDocument();
  });
});
