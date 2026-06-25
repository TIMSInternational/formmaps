import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecommendationActionMenu } from "../RecommendationActionMenu";
import * as svc from "@/services/recommendationService";
import type { RecommendationRequest } from "@/services/recommendationService";

jest.mock("@/services/recommendationService");
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const respond = svc.respondToRecommendation as jest.Mock;
const getUrl = svc.getRecommendationLetterUrl as jest.Mock;

const base: RecommendationRequest = {
  id: "r1", studentId: "s1", recommenderId: "u1", status: "requested",
  relationship: "Teacher", requestMessage: "hi", declineReason: null, dueDate: null,
  submittedAt: null, letterFileKey: null, letterFileName: null, letterUploadedAt: null, createdDate: "2026-01-01",
};

const open = () => fireEvent.click(screen.getByRole("button", { name: /actions/i }));

describe("RecommendationActionMenu", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders nothing when not my request", () => {
    const { container } = render(<RecommendationActionMenu req={base} isMyRequest={false} onAction={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("accepts a requested request", async () => {
    respond.mockResolvedValue({});
    const onAction = jest.fn();
    render(<RecommendationActionMenu req={base} isMyRequest onAction={onAction} />);
    open();
    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("r1", "accept"));
    await waitFor(() => expect(onAction).toHaveBeenCalled());
  });

  it("declines with a reason from the prompt", async () => {
    respond.mockResolvedValue({});
    jest.spyOn(window, "prompt").mockReturnValue("Not enough context");
    render(<RecommendationActionMenu req={base} isMyRequest onAction={jest.fn()} />);
    open();
    fireEvent.click(screen.getByText("Decline"));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("r1", "decline", "Not enough context"));
  });

  it("shows Upload Letter when accepted", () => {
    render(<RecommendationActionMenu req={{ ...base, status: "accepted" }} isMyRequest onAction={jest.fn()} />);
    open();
    expect(screen.getByText(/upload letter/i)).toBeInTheDocument();
  });

  it("shows Download Letter when submitted and opens the signed URL", async () => {
    getUrl.mockResolvedValue({ url: "https://x/letter.pdf", filename: "letter.pdf" });
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    render(<RecommendationActionMenu req={{ ...base, status: "submitted", letterFileKey: "k" }} isMyRequest onAction={jest.fn()} />);
    open();
    fireEvent.click(screen.getByText(/download letter/i));
    await waitFor(() => expect(getUrl).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith("https://x/letter.pdf", "_blank", "noopener,noreferrer"));
  });
});
