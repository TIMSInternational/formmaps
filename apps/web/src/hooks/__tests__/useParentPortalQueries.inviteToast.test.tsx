/**
 * audit 2026-10-09 C8b / C8 / C9 — what the user is told after a parent invite.
 * The invitation link is emailed to the parent and never returned, so the toast must say where
 * it went ("Invitation sent to <email>"), or that the email failed (error toast), or that the
 * address already had a parent account and was linked. The counselor panel's scope reaches the
 * service (the school-admin routes 403 for counselors).
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import {
  toastParentInviteResult,
  useInviteMyParent,
  useInviteParent,
  useResendParentInvite,
  useStudentParents,
} from "../useParentPortalQueries";
import {
  getStudentParents,
  inviteMyParent,
  inviteParentToStudent,
  resendParentInvite,
} from "@/services/parentPortalService";

jest.mock("@/services/parentPortalService", () => ({
  getStudentParents: jest.fn(),
  inviteParentToStudent: jest.fn(),
  revokeParentAccess: jest.fn(),
  resendParentInvite: jest.fn(),
  getMyParents: jest.fn(),
  inviteMyParent: jest.fn(),
  revokeMyParentAccess: jest.fn(),
  resendMyParentInvite: jest.fn(),
  getParentNotifications: jest.fn(),
  markParentNotificationRead: jest.fn(),
  markAllParentNotificationsRead: jest.fn(),
  verifyParentInviteToken: jest.fn(),
  completeParentOnboarding: jest.fn(),
  getParentProfile: jest.fn(),
  getChildProgress: jest.fn(),
  getParentPendingEvaluations: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const success = toast.success as jest.Mock;
const error = toast.error as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  jest.clearAllMocks();
  (getStudentParents as jest.Mock).mockResolvedValue([]);
  await i18n.changeLanguage("en");
});

describe("toastParentInviteResult", () => {
  it("emailSent → 'Invitation sent to <email>'", () => {
    toastParentInviteResult({ id: "l", emailSent: true }, "mom@x.com");
    expect(success).toHaveBeenCalledWith("Invitation sent to mom@x.com");
    expect(error).not.toHaveBeenCalled();
  });

  it("emailSent false → an error toast naming the address", () => {
    toastParentInviteResult({ id: "l", emailSent: false }, "mom@x.com");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("mom@x.com"));
    expect(success).not.toHaveBeenCalled();
  });

  it("alreadyLinked → linked message, not 'invitation sent'", () => {
    toastParentInviteResult({ id: "l", emailSent: true, alreadyLinked: true }, "mom@x.com");
    expect(success).toHaveBeenCalledWith(expect.stringContaining("already has a parent account"));
    toastParentInviteResult({ id: "l", emailSent: false, alreadyLinked: true }, "mom@x.com");
    expect(success).toHaveBeenLastCalledWith("mom@x.com is already linked to this student.");
  });

  it("is translated (es)", async () => {
    await i18n.changeLanguage("es");
    toastParentInviteResult({ id: "l", emailSent: true }, "mamá@x.com");
    expect(success).toHaveBeenCalledWith("Invitación enviada a mamá@x.com");
  });
});

describe("hooks wire the result into the toast", () => {
  it("student self-invite toasts where the invitation went", async () => {
    (inviteMyParent as jest.Mock).mockResolvedValue({ id: "l", emailSent: true });
    const { result } = renderHook(() => useInviteMyParent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "Mom", email: "mom@x.com", relationship: "mother" });
    });
    expect(success).toHaveBeenCalledWith("Invitation sent to mom@x.com");
  });

  it("student self-invite with a failed email → error toast", async () => {
    (inviteMyParent as jest.Mock).mockResolvedValue({ id: "l", emailSent: false });
    const { result } = renderHook(() => useInviteMyParent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "Mom", email: "mom@x.com", relationship: "mother" });
    });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("could not be sent"));
  });

  it("counselor scope reaches list, invite and resend", async () => {
    (inviteParentToStudent as jest.Mock).mockResolvedValue({ id: "l", emailSent: true });
    (resendParentInvite as jest.Mock).mockResolvedValue({ emailSent: true });
    const { result } = renderHook(
      () => ({ list: useStudentParents("s-1", "counselor"), invite: useInviteParent("counselor"), resend: useResendParentInvite("counselor") }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(getStudentParents).toHaveBeenCalledWith("s-1", "counselor");
    await act(async () => {
      await result.current.invite.mutateAsync({ studentId: "s-1", name: "Mom", email: "mom@x.com", relationship: "mother" });
    });
    expect(inviteParentToStudent).toHaveBeenCalledWith(expect.objectContaining({ studentId: "s-1" }), "counselor");
    await act(async () => {
      await result.current.resend.mutateAsync({ studentId: "s-1", parentLinkId: "l", email: "mom@x.com" });
    });
    expect(resendParentInvite).toHaveBeenCalledWith("s-1", "l", "counselor");
    expect(success).toHaveBeenLastCalledWith("Invitation sent to mom@x.com");
  });
});
