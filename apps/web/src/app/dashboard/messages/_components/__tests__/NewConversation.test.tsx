import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NewConversation from "../NewConversation";

const searchContacts = jest.fn();
const createConversation = jest.fn();
jest.mock("@/services/messageService", () => ({
  searchContacts: (...args: unknown[]) => searchContacts(...args),
  createConversation: (...args: unknown[]) => createConversation(...args),
}));

const counselor = { id: "c1", name: "Test Counselor", email: "c@s.dev", roleName: "counselor" };

beforeEach(() => {
  jest.clearAllMocks();
  searchContacts.mockResolvedValue([counselor]);
});

describe("NewConversation", () => {
  it("opens the contact picker and lists messageable staff", async () => {
    render(<NewConversation onCreated={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /new conversation/i }));
    await waitFor(() => expect(screen.getByText("Test Counselor")).toBeInTheDocument());
    expect(searchContacts).toHaveBeenCalled();
  });

  it("creates a conversation and notifies the parent when a contact is picked", async () => {
    const conversation = { id: "conv1", otherParticipant: counselor, lastMessagePreview: null, lastMessageAt: null, unreadCount: 0 };
    createConversation.mockResolvedValue(conversation);
    const onCreated = jest.fn();

    render(<NewConversation onCreated={onCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /new conversation/i }));
    fireEvent.click(await screen.findByText("Test Counselor"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(conversation));
    expect(createConversation).toHaveBeenCalledWith("c1");
  });

  it("shows an empty message when there is no one to message", async () => {
    searchContacts.mockResolvedValue([]);
    render(<NewConversation onCreated={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /new conversation/i }));
    await waitFor(() => expect(screen.getByText(/no staff found/i)).toBeInTheDocument());
  });
});
