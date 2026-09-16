/**
 * InviteUserWizard — the behaviours worth pinning are the ones that encode a
 * server rule the UI could silently contradict:
 *   - a full school blocks a STUDENT but not staff (staff consume no seat),
 *   - emailSent:false is shown as a warning, never as a plain success,
 *   - EMAIL_ALREADY_ACTIVE gets its own guidance, because "invite" cannot move
 *     an account that already exists — the exact case that used to report
 *     success while doing nothing.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InviteUserWizard } from "../InviteUserWizard";
import { getSchools } from "@/services/schoolService";
import { inviteUser, InviteError } from "@/services/adminUsersService";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/services/schoolService", () => ({ getSchools: jest.fn() }));
jest.mock("@/services/adminUsersService", () => {
  class InviteError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "InviteError";
      this.code = code;
    }
  }
  return {
    INVITABLE_ROLES: ["student", "counselor", "school_admin"],
    InviteError,
    inviteUser: jest.fn(),
  };
});

const mockGetSchools = getSchools as jest.MockedFunction<typeof getSchools>;
const mockInvite = inviteUser as jest.MockedFunction<typeof inviteUser>;

const SCHOOLS = [
  { id: "s-room", name: "Country Day School", adminEmail: "jack@countryday.edu", maxStudents: 500, studentCount: 21, status: "active" as const },
  { id: "s-full", name: "Tiny Academy", adminEmail: "head@tiny.edu", maxStudents: 2, studentCount: 2, status: "active" as const },
];

const okResult = {
  userId: "u1",
  email: "new@example.com",
  name: "New Person",
  role: "student" as const,
  schoolId: "s-room",
  schoolName: "Country Day School",
  action: "created" as const,
  emailSent: true,
  expiresAt: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockGetSchools.mockResolvedValue({ data: SCHOOLS, total: 2, page: 1, limit: 50, totalPages: 1 } as any);
  mockInvite.mockResolvedValue(okResult);
});

const openWizard = async () => {
  render(<InviteUserWizard onInvited={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /admin.users.invite.trigger/ }));
  await screen.findByText("admin.users.invite.title");
};

const fillPerson = (email = "new@example.com") => {
  fireEvent.change(screen.getByLabelText("admin.users.invite.person.nameLabel"), { target: { value: "New Person" } });
  fireEvent.change(screen.getByLabelText("admin.users.invite.person.emailLabel"), { target: { value: email } });
};

const nextBtn = () => screen.getByRole("button", { name: /admin.users.invite.next/ });

describe("step gating", () => {
  it("cannot leave the person step without a name and a valid email", async () => {
    await openWizard();
    expect(nextBtn()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("admin.users.invite.person.nameLabel"), { target: { value: "New Person" } });
    expect(nextBtn()).toBeDisabled(); // email still missing

    fireEvent.change(screen.getByLabelText("admin.users.invite.person.emailLabel"), { target: { value: "not-an-email" } });
    expect(nextBtn()).toBeDisabled();
    expect(screen.getByText("admin.users.invite.person.emailInvalid")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("admin.users.invite.person.emailLabel"), { target: { value: "new@example.com" } });
    expect(nextBtn()).toBeEnabled();
  });
});

describe("seat rules mirror the server", () => {
  it("a full school is NOT selectable for a student", async () => {
    await openWizard();
    fillPerson();
    fireEvent.click(nextBtn());

    const full = await screen.findByRole("button", { name: /Tiny Academy/ });
    expect(full).toBeDisabled();
    expect(await screen.findByRole("button", { name: /Country Day School/ })).toBeEnabled();
  });

  it("the same full school IS selectable for a counselor — staff use no seat", async () => {
    await openWizard();
    fillPerson();
    fireEvent.click(screen.getByRole("button", { name: /admin.users.invite.roles.counselor.label/ }));
    fireEvent.click(nextBtn());

    expect(await screen.findByRole("button", { name: /Tiny Academy/ })).toBeEnabled();
  });
});

describe("sending", () => {
  const advanceToReview = async () => {
    await openWizard();
    fillPerson();
    fireEvent.click(nextBtn());
    fireEvent.click(await screen.findByRole("button", { name: /Country Day School/ }));
    fireEvent.click(nextBtn());
    return screen.findByRole("button", { name: /admin.users.invite.send/ });
  };

  it("sends the chosen person, role and school", async () => {
    const onInvited = jest.fn();
    render(<InviteUserWizard onInvited={onInvited} />);
    fireEvent.click(screen.getByRole("button", { name: /admin.users.invite.trigger/ }));
    await screen.findByText("admin.users.invite.title");
    fillPerson();
    fireEvent.click(screen.getByRole("button", { name: /admin.users.invite.next/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Country Day School/ }));
    fireEvent.click(screen.getByRole("button", { name: /admin.users.invite.next/ }));
    fireEvent.click(await screen.findByRole("button", { name: /admin.users.invite.send/ }));

    await waitFor(() =>
      expect(mockInvite).toHaveBeenCalledWith({
        email: "new@example.com",
        name: "New Person",
        role: "student",
        schoolId: "s-room",
      }),
    );
    expect(await screen.findByText("admin.users.invite.result.createdTitle")).toBeInTheDocument();
    expect(onInvited).toHaveBeenCalled();
  });

  it("a re-sent invitation is labelled as such, not as a new account", async () => {
    mockInvite.mockResolvedValue({ ...okResult, action: "resent" });
    fireEvent.click(await advanceToReview());
    expect(await screen.findByText("admin.users.invite.result.resentTitle")).toBeInTheDocument();
  });

  it("emailSent:false is surfaced as a warning, not a clean success", async () => {
    mockInvite.mockResolvedValue({ ...okResult, emailSent: false });
    fireEvent.click(await advanceToReview());
    expect(await screen.findByText("admin.users.invite.result.emailFailed")).toBeInTheDocument();
    expect(screen.queryByText("admin.users.invite.result.emailSent")).not.toBeInTheDocument();
  });
});

describe("failures", () => {
  it("EMAIL_ALREADY_ACTIVE explains that an invite cannot move an existing account", async () => {
    mockInvite.mockRejectedValue(new InviteError("EMAIL_ALREADY_ACTIVE", "already has an active account"));
    await openWizard();
    fillPerson();
    fireEvent.click(nextBtn());
    fireEvent.click(await screen.findByRole("button", { name: /Country Day School/ }));
    fireEvent.click(nextBtn());
    fireEvent.click(await screen.findByRole("button", { name: /admin.users.invite.send/ }));

    expect(await screen.findByText("admin.users.invite.result.failedTitle")).toBeInTheDocument();
    expect(screen.getByText("already has an active account")).toBeInTheDocument();
    expect(screen.getByText("admin.users.invite.result.alreadyActiveHint")).toBeInTheDocument();
  });

  it("a generic failure shows the message but not the already-active guidance", async () => {
    mockInvite.mockRejectedValue(new InviteError("SCHOOL_FULL", "school is at its limit"));
    await openWizard();
    fillPerson();
    fireEvent.click(nextBtn());
    fireEvent.click(await screen.findByRole("button", { name: /Country Day School/ }));
    fireEvent.click(nextBtn());
    fireEvent.click(await screen.findByRole("button", { name: /admin.users.invite.send/ }));

    expect(await screen.findByText("school is at its limit")).toBeInTheDocument();
    expect(screen.queryByText("admin.users.invite.result.alreadyActiveHint")).not.toBeInTheDocument();
  });
});
