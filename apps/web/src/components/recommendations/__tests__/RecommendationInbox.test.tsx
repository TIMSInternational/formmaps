import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecommendationInbox } from "../RecommendationInbox";
import * as svc from "@/services/recommendationService";

jest.mock("@/services/recommendationService");
const listReceived = svc.listReceivedRecommendations as jest.Mock;

function renderInbox() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RecommendationInbox roleLabel="Teacher" /></QueryClientProvider>);
}

const row = (over: Partial<svc.RecommendationRequest>): svc.RecommendationRequest => ({
  id: "r1", studentId: "s1", recommenderId: "u1", status: "requested", relationship: "Teacher",
  requestMessage: "hi", declineReason: null, dueDate: null, submittedAt: null, letterFileKey: null,
  letterFileName: null, letterUploadedAt: null, createdDate: "2026-01-01",
  student: { name: "Jane Student", email: "jane@s1.dev" }, ...over,
});

describe("RecommendationInbox", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the empty state when there are no requests", async () => {
    listReceived.mockResolvedValue([]);
    renderInbox();
    await waitFor(() => expect(screen.getByText(/no recommendation requests/i)).toBeInTheDocument());
  });

  it("renders received requests with the student name and status", async () => {
    listReceived.mockResolvedValue([row({ status: "accepted" })]);
    renderInbox();
    await waitFor(() => expect(screen.getByText("Jane Student")).toBeInTheDocument());
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("shows the error state when the fetch fails", async () => {
    listReceived.mockRejectedValue(new Error("boom"));
    renderInbox();
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
  });
});
