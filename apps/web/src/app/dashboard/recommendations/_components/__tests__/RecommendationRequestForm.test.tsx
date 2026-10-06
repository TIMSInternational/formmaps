import { render, screen, fireEvent, act } from "@testing-library/react";
import i18n from "@/lib/i18n";
import RecommendationRequestForm from "../RecommendationRequestForm";

const apiRequest = jest.fn();
jest.mock("@/lib/api/apiClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const requestRecommendation = jest.fn();
jest.mock("@/services/recommendationService", () => ({
  requestRecommendation: (...args: unknown[]) => requestRecommendation(...args),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const COUNSELOR = { id: "c1", name: "Coun Selor", email: "c@s.dev", roleName: "counselor" };

beforeEach(async () => {
  jest.useFakeTimers();
  apiRequest.mockReset();
  requestRecommendation.mockReset().mockResolvedValue({ id: "r1" });
  apiRequest.mockResolvedValue({ data: [COUNSELOR] });
  await i18n.changeLanguage("en");
});

afterEach(() => {
  jest.useRealTimers();
});

const sendButton = () => screen.getByRole("button", { name: /send request/i });

async function renderForm() {
  render(<RecommendationRequestForm onClose={jest.fn()} onSuccess={jest.fn()} />);
  await act(async () => {});
}

async function selectStaff() {
  fireEvent.change(screen.getByPlaceholderText("Search counselors and staff..."), {
    target: { value: "coun" },
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  fireEvent.click(await screen.findByText("Coun Selor"));
}

function fillRelationship(value: string) {
  fireEvent.change(screen.getByPlaceholderText("e.g., Math teacher, counselor"), {
    target: { value },
  });
}

function fillMessage(value: string) {
  fireEvent.change(
    screen.getByPlaceholderText(/describe why you are requesting this letter/i),
    { target: { value } }
  );
}

describe("RecommendationRequestForm (#412)", () => {
  it("Send is disabled on an empty form", async () => {
    await renderForm();
    expect(sendButton()).toBeDisabled();
  });

  it("typing in the staff search WITHOUT selecting a result keeps Send disabled", async () => {
    await renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search counselors and staff..."), {
      target: { value: "a" },
    });
    fillRelationship("Counselor");
    fillMessage("Please write me a letter.");
    expect(sendButton()).toBeDisabled();
  });

  it("whitespace-only relationship or message keeps Send disabled", async () => {
    await renderForm();
    await selectStaff();
    fillRelationship("   ");
    fillMessage("Please write me a letter.");
    expect(sendButton()).toBeDisabled();

    fillRelationship("Counselor");
    fillMessage("  \n ");
    expect(sendButton()).toBeDisabled();
  });

  it("enables Send only once a staff member is selected AND both required fields are valid, and submits trimmed values", async () => {
    await renderForm();
    fillRelationship("Counselor");
    fillMessage("Please write me a letter.");
    expect(sendButton()).toBeDisabled();

    await selectStaff();
    expect(sendButton()).toBeEnabled();

    fillRelationship("  Counselor  ");
    await act(async () => {
      fireEvent.click(sendButton());
    });
    expect(requestRecommendation).toHaveBeenCalledWith({
      recommenderId: "c1",
      relationship: "Counselor",
      requestMessage: "Please write me a letter.",
      dueDate: undefined,
    });
  });

  it("clearing the selected staff member disables Send again", async () => {
    await renderForm();
    await selectStaff();
    fillRelationship("Counselor");
    fillMessage("Please write me a letter.");
    expect(sendButton()).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /clear selected staff member/i }));
    expect(sendButton()).toBeDisabled();
  });
});
