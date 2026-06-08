import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ModerationMenu from "../ModerationMenu";

const reportTarget = jest.fn();
const blockUser = jest.fn();
const unblockUser = jest.fn();
jest.mock("@/services/moderationService", () => ({
  reportTarget: (...a: unknown[]) => reportTarget(...a),
  blockUser: (...a: unknown[]) => blockUser(...a),
  unblockUser: (...a: unknown[]) => unblockUser(...a),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// Render motion elements and AnimatePresence as plain passthroughs so exit
// animations don't keep nodes mounted in jsdom.
jest.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: React.ReactNode };
    return <div {...rest}>{children}</div>;
  } }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  reportTarget.mockResolvedValue({ id: "rep-1", status: "open" });
  blockUser.mockResolvedValue(undefined);
  unblockUser.mockResolvedValue(undefined);
});

describe("ModerationMenu", () => {
  it("reports the user with the typed reason", async () => {
    render(<ModerationMenu targetUserId="u-9" targetName="Coach Dave" />);
    fireEvent.click(screen.getByRole("button", { name: /report or block/i }));
    fireEvent.click(screen.getByText(/report coach dave/i));

    fireEvent.change(screen.getByPlaceholderText(/what's wrong/i), { target: { value: "inappropriate contact" } });
    fireEvent.click(screen.getByText(/submit report/i));

    await waitFor(() => expect(reportTarget).toHaveBeenCalledWith("user", "u-9", "inappropriate contact"));
  });

  it("does not submit an empty report", () => {
    render(<ModerationMenu targetUserId="u-9" targetName="Coach Dave" />);
    fireEvent.click(screen.getByRole("button", { name: /report or block/i }));
    fireEvent.click(screen.getByText(/report coach dave/i));
    fireEvent.click(screen.getByText(/submit report/i));
    expect(reportTarget).not.toHaveBeenCalled();
  });

  it("blocks the user", async () => {
    render(<ModerationMenu targetUserId="u-9" targetName="Coach Dave" />);
    fireEvent.click(screen.getByRole("button", { name: /report or block/i }));
    fireEvent.click(screen.getByText(/block coach dave/i));
    await waitFor(() => expect(blockUser).toHaveBeenCalledWith("u-9"));
  });
});
