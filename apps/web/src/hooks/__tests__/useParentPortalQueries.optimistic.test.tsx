/**
 * useParentPortalQueries.optimistic.test.tsx — formmaps#89.
 *
 * The parent-portal hooks add two shapes the gradebook and notes tests do not cover:
 *
 *  1. A write whose response is NOT the list row. Both invite endpoints answer with an
 *     id and an invitation URL, never the row the list renders, so the placeholder has
 *     to survive until a refetch reconciles it — the one refetch this file keeps. The
 *     tests below pin the refetch to the key the list is actually READ from; an
 *     invalidate aimed one key off is invisible in the UI until the data goes stale.
 *
 *  2. Writes that are deliberately NOT optimistic — resend (the server re-mints a token
 *     whose expiry drives the `status` badge) and onboarding (a server-issued account).
 *     A skip is only correct if it is a real skip, so those are asserted too: the cache
 *     must not move before the server answers.
 *
 * Cache state is built by RENDERING THE READ HOOK and letting its real queryFn resolve,
 * not by poking `setQueryData` — a query seeded by hand can be missing the observer that
 * makes an invalidation refetch anything at all, which is exactly the defect these tests
 * exist to catch.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  parentKeys,
  useStudentParents,
  useInviteParent,
  useRevokeParentAccess,
  useResendParentInvite,
  useMyParents,
  useInviteMyParent,
  useRevokeMyParentAccess,
  useResendMyParentInvite,
  useParentNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useCompleteParentOnboarding,
} from "../useParentPortalQueries";
import {
  getStudentParents,
  inviteParentToStudent,
  revokeParentAccess,
  resendParentInvite,
  getMyParents,
  inviteMyParent,
  revokeMyParentAccess,
  resendMyParentInvite,
  getParentNotifications,
  markParentNotificationRead,
  markAllParentNotificationsRead,
  completeParentOnboarding,
} from "@/services/parentPortalService";
import type { ParentNotification, StudentParentLink } from "@/types/parentPortal";

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

const mockListParents = getStudentParents as jest.Mock;
const mockInvite = inviteParentToStudent as jest.Mock;
const mockRevoke = revokeParentAccess as jest.Mock;
const mockResend = resendParentInvite as jest.Mock;
const mockListMine = getMyParents as jest.Mock;
const mockInviteMine = inviteMyParent as jest.Mock;
const mockRevokeMine = revokeMyParentAccess as jest.Mock;
const mockResendMine = resendMyParentInvite as jest.Mock;
const mockListNotifications = getParentNotifications as jest.Mock;
const mockMarkRead = markParentNotificationRead as jest.Mock;
const mockMarkAllRead = markAllParentNotificationsRead as jest.Mock;
const mockOnboard = completeParentOnboarding as jest.Mock;

const STUDENT = "stu-1";
/** Written out longhand: an assertion that reuses `parentKeys` cannot catch key drift. */
const STUDENT_PARENTS_KEY = ["parent", "student-parents", STUDENT];
const MY_PARENTS_KEY = ["parent", "my-parents"];

const NEVER = () => new Promise<never>(() => {});

const link = (id: string, over: Partial<StudentParentLink> = {}): StudentParentLink => ({
  id,
  name: `Parent ${id}`,
  email: `${id}@example.com`,
  relationship: "mother",
  status: "pending",
  invitedAt: "2026-08-01T10:00:00.000Z",
  ...over,
});

const notif = (id: string, over: Partial<ParentNotification> = {}): ParentNotification => ({
  id,
  title: `notification ${id}`,
  message: `body ${id}`,
  type: "system",
  isRead: false,
  createdDate: "2026-08-01T10:00:00.000Z",
  ...over,
});

const INVITE = {
  studentId: STUDENT,
  name: "Maria Gonzalez",
  email: "maria@example.com",
  relationship: "mother" as const,
};

function harness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const links = (qc: QueryClient, key: unknown[] = STUDENT_PARENTS_KEY) =>
  qc.getQueryData<StudentParentLink[]>(key) ?? [];

const notifications = (qc: QueryClient) =>
  qc.getQueryData<ParentNotification[]>(parentKeys.notifications()) ?? [];

/** Render a read hook plus the mutation under test, and wait for the list to load. */
async function mount<T>(use: () => T) {
  const { qc, wrapper } = harness();
  const { result } = renderHook(use, { wrapper });
  return { qc, result };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListParents.mockResolvedValue([link("p-1"), link("p-2")]);
  mockListMine.mockResolvedValue([link("m-1"), link("m-2")]);
  mockListNotifications.mockResolvedValue([notif("n-1"), notif("n-2", { isRead: true })]);
});

describe("#89 the parent list changes before the server answers", () => {
  it("shows an invited guardian immediately, at the top", async () => {
    // Never settles: if the row only appeared on success, nothing would show at all.
    mockInvite.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      invite: useInviteParent(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => { result.current.invite.mutate(INVITE); });

    // Top, not bottom: the list comes back ordered createdDate desc.
    await waitFor(() => expect(links(qc)).toHaveLength(3));
    expect(links(qc)[0]).toMatchObject({
      name: "Maria Gonzalez",
      email: "maria@example.com",
      relationship: "mother",
      status: "pending",
    });
  });

  it("marks the unpersisted row with a placeholder id", async () => {
    // The id is the one field an invite cannot know. Prefixing it keeps any code that
    // keys off ids from sending `DELETE /parents/optimistic-…` to the server.
    mockInvite.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      invite: useInviteParent(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => { result.current.invite.mutate(INVITE); });

    await waitFor(() => expect(links(qc)).toHaveLength(3));
    expect(links(qc)[0].id.startsWith("optimistic-")).toBe(true);
  });

  it("shows a self-invited guardian immediately", async () => {
    mockInviteMine.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useMyParents(),
      invite: useInviteMyParent(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => {
      result.current.invite.mutate({
        name: "Maria Gonzalez",
        email: "maria@example.com",
        relationship: "mother",
      });
    });

    await waitFor(() => expect(links(qc, MY_PARENTS_KEY)).toHaveLength(3));
    expect(links(qc, MY_PARENTS_KEY)[0].name).toBe("Maria Gonzalez");
  });

  it("removes a revoked guardian immediately", async () => {
    mockRevoke.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      revoke: useRevokeParentAccess(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => {
      result.current.revoke.mutate({ studentId: STUDENT, parentLinkId: "p-1" });
    });

    await waitFor(() => expect(links(qc).map((p) => p.id)).toEqual(["p-2"]));
  });

  it("removes a self-revoked guardian immediately", async () => {
    mockRevokeMine.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useMyParents(),
      revoke: useRevokeMyParentAccess(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => { result.current.revoke.mutate("m-1"); });

    await waitFor(() => expect(links(qc, MY_PARENTS_KEY).map((p) => p.id)).toEqual(["m-2"]));
  });
});

describe("#89 notifications read state flips on click, not on response", () => {
  it("marks one notification read immediately", async () => {
    mockMarkRead.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useParentNotifications(),
      markRead: useMarkNotificationRead(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => { result.current.markRead.mutate("n-1"); });

    await waitFor(() => expect(notifications(qc)[0].isRead).toBe(true));
  });

  it("marks only the notification that was clicked", async () => {
    mockMarkRead.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useParentNotifications(),
      markRead: useMarkNotificationRead(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const untouched = notifications(qc)[1];

    act(() => { result.current.markRead.mutate("n-1"); });

    await waitFor(() => expect(notifications(qc)[0].isRead).toBe(true));
    // Same object, not a copy: an already-read row must not be re-rendered.
    expect(notifications(qc)[1]).toBe(untouched);
  });

  it("marks every unread notification immediately on mark-all", async () => {
    mockMarkAllRead.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useParentNotifications(),
      markAll: useMarkAllNotificationsRead(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => { result.current.markAll.mutate(); });

    await waitFor(() =>
      expect(notifications(qc).every((n) => n.isRead)).toBe(true),
    );
    expect(notifications(qc)).toHaveLength(2);
  });
});

describe("#89 rollback — the half that usually goes untested", () => {
  it("restores the exact list when an invite fails", async () => {
    // The invalidate in onSettled would otherwise refetch over the rollback and hide
    // whether it happened; holding the refetch open makes the assertion mean something.
    mockListParents.mockReset().mockResolvedValueOnce([link("p-1"), link("p-2")]).mockImplementation(NEVER);
    mockInvite.mockRejectedValue(new Error("500"));
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      invite: useInviteParent(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const before = qc.getQueryData(STUDENT_PARENTS_KEY);

    act(() => { result.current.invite.mutate(INVITE); });

    await waitFor(() => expect(result.current.invite.isError).toBe(true));
    expect(qc.getQueryData(STUDENT_PARENTS_KEY)).toEqual(before);
    expect(links(qc).some((p) => p.id.startsWith("optimistic-"))).toBe(false);
  });

  it("restores the exact list when a self-invite fails", async () => {
    mockListMine.mockReset().mockResolvedValueOnce([link("m-1"), link("m-2")]).mockImplementation(NEVER);
    mockInviteMine.mockRejectedValue(new Error("500"));
    const { qc, result } = await mount(() => ({
      list: useMyParents(),
      invite: useInviteMyParent(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const before = qc.getQueryData(MY_PARENTS_KEY);

    act(() => {
      result.current.invite.mutate({
        name: "Maria Gonzalez",
        email: "maria@example.com",
        relationship: "mother",
      });
    });

    await waitFor(() => expect(result.current.invite.isError).toBe(true));
    expect(qc.getQueryData(MY_PARENTS_KEY)).toEqual(before);
  });

  it("puts the guardian BACK when a revoke is rejected", async () => {
    // The realistic failure, not a hypothetical: the panel shows a revoke button on
    // every row. Without rollback the guardian stays gone until a reload, and there is
    // no refetch here to paper over it — which reads as data loss.
    mockRevoke.mockRejectedValue(new Error("Not authorized"));
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      revoke: useRevokeParentAccess(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const before = qc.getQueryData(STUDENT_PARENTS_KEY);

    act(() => {
      result.current.revoke.mutate({ studentId: STUDENT, parentLinkId: "p-1" });
    });

    await waitFor(() => expect(result.current.revoke.isError).toBe(true));
    expect(qc.getQueryData(STUDENT_PARENTS_KEY)).toEqual(before);
  });

  it("puts the guardian BACK when a self-revoke is rejected", async () => {
    mockRevokeMine.mockRejectedValue(new Error("Not authorized"));
    const { qc, result } = await mount(() => ({
      list: useMyParents(),
      revoke: useRevokeMyParentAccess(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const before = qc.getQueryData(MY_PARENTS_KEY);

    act(() => { result.current.revoke.mutate("m-1"); });

    await waitFor(() => expect(result.current.revoke.isError).toBe(true));
    expect(qc.getQueryData(MY_PARENTS_KEY)).toEqual(before);
  });

  it("un-reads a notification when the request fails", async () => {
    mockMarkRead.mockRejectedValue(new Error("500"));
    const { qc, result } = await mount(() => ({
      list: useParentNotifications(),
      markRead: useMarkNotificationRead(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const before = qc.getQueryData(parentKeys.notifications());

    act(() => { result.current.markRead.mutate("n-1"); });

    await waitFor(() => expect(result.current.markRead.isError).toBe(true));
    expect(qc.getQueryData(parentKeys.notifications())).toEqual(before);
    expect(notifications(qc)[0].isRead).toBe(false);
  });

  it("restores the mixed read/unread state when mark-all fails", async () => {
    // The row that was ALREADY read must come back read: a rollback that resets the
    // whole list to unread is a different kind of wrong.
    mockMarkAllRead.mockRejectedValue(new Error("500"));
    const { qc, result } = await mount(() => ({
      list: useParentNotifications(),
      markAll: useMarkAllNotificationsRead(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => { result.current.markAll.mutate(); });

    await waitFor(() => expect(result.current.markAll.isError).toBe(true));
    expect(notifications(qc).map((n) => n.isRead)).toEqual([false, true]);
  });
});

describe("#89 the invalidation lands on the key the list is read from", () => {
  it("refetches the student's parents after an invite settles", async () => {
    // Asserted as a real refetch rather than a spy call: an invalidate aimed one key
    // off still "fires", it just never reaches the query the panel renders.
    mockListParents
      .mockReset()
      .mockResolvedValueOnce([link("p-1"), link("p-2")])
      .mockResolvedValue([link("real-1"), link("p-1"), link("p-2")]);
    mockInvite.mockResolvedValue({ inviteId: "real-1", message: "sent" });
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      invite: useInviteParent(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => { result.current.invite.mutate(INVITE); });

    await waitFor(() => expect(mockListParents).toHaveBeenCalledTimes(2));
    // And the placeholder is gone once the real row arrives — a leftover would be an
    // id the server has never heard of, sitting behind a revoke button.
    await waitFor(() =>
      expect(links(qc).map((p) => p.id)).toEqual(["real-1", "p-1", "p-2"]),
    );
  });

  it("invalidates exactly ['parent','student-parents',studentId] on invite", async () => {
    mockInvite.mockResolvedValue({ inviteId: "real-1", message: "sent" });
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      invite: useInviteParent(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    act(() => { result.current.invite.mutate(INVITE); });

    await waitFor(() => expect(result.current.invite.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: STUDENT_PARENTS_KEY });
  });

  it("refetches my parents after a self-invite settles", async () => {
    mockInviteMine.mockResolvedValue({ inviteId: "real-1", message: "sent" });
    const { result } = await mount(() => ({
      list: useMyParents(),
      invite: useInviteMyParent(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => {
      result.current.invite.mutate({
        name: "Maria Gonzalez",
        email: "maria@example.com",
        relationship: "mother",
      });
    });

    await waitFor(() => expect(mockListMine).toHaveBeenCalledTimes(2));
  });

  it("invalidates exactly ['parent','my-parents'] on self-invite", async () => {
    mockInviteMine.mockResolvedValue({ inviteId: "real-1", message: "sent" });
    const { qc, result } = await mount(() => ({
      list: useMyParents(),
      invite: useInviteMyParent(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      result.current.invite.mutate({
        name: "Maria Gonzalez",
        email: "maria@example.com",
        relationship: "mother",
      });
    });

    await waitFor(() => expect(result.current.invite.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MY_PARENTS_KEY });
  });

  it("does NOT refetch after a revoke — the removal is the whole change", async () => {
    mockRevoke.mockResolvedValue(undefined);
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      revoke: useRevokeParentAccess(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      result.current.revoke.mutate({ studentId: STUDENT, parentLinkId: "p-1" });
    });

    await waitFor(() => expect(result.current.revoke.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    expect(mockListParents).toHaveBeenCalledTimes(1);
    expect(links(qc).map((p) => p.id)).toEqual(["p-2"]);
  });

  it("does NOT refetch after marking a notification read", async () => {
    // This assertion IS #89 for this hook: the old code refetched the entire
    // notification list on every "mark read" click, for a boolean the client already
    // knew, on an endpoint that answers with no body.
    mockMarkRead.mockResolvedValue(undefined);
    const { qc, result } = await mount(() => ({
      list: useParentNotifications(),
      markRead: useMarkNotificationRead(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    act(() => { result.current.markRead.mutate("n-1"); });

    await waitFor(() => expect(result.current.markRead.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    expect(mockListNotifications).toHaveBeenCalledTimes(1);
    expect(notifications(qc)[0].isRead).toBe(true);
  });

  it("does NOT refetch after mark-all", async () => {
    mockMarkAllRead.mockResolvedValue(undefined);
    const { qc, result } = await mount(() => ({
      list: useParentNotifications(),
      markAll: useMarkAllNotificationsRead(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    act(() => { result.current.markAll.mutate(); });

    await waitFor(() => expect(result.current.markAll.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    expect(notifications(qc).every((n) => n.isRead)).toBe(true);
  });
});

describe("#89 the writes that are deliberately not optimistic", () => {
  it("leaves the list alone while a resend is in flight, then refetches it", async () => {
    // A resend's only visible effect is a new token expiry, and `status` is derived
    // from it — so there is nothing here the client could fake without guessing the
    // server's expiry window.
    mockResend.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      resend: useResendParentInvite(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const before = qc.getQueryData(STUDENT_PARENTS_KEY);

    act(() => {
      result.current.resend.mutate({ studentId: STUDENT, parentLinkId: "p-1" });
    });

    await waitFor(() => expect(result.current.resend.isPending).toBe(true));
    // `isPending` flips before `onMutate` has finished awaiting `cancelQueries`, so
    // asserting on it alone would pass even against a hook that DOES patch here.
    // Draining the microtask queue first is what makes this a real assertion.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(qc.getQueryData(STUDENT_PARENTS_KEY)).toBe(before);
  });

  it("refetches the student's parents once a resend succeeds", async () => {
    mockResend.mockResolvedValue(undefined);
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      resend: useResendParentInvite(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      result.current.resend.mutate({ studentId: STUDENT, parentLinkId: "p-1" });
    });

    await waitFor(() => expect(mockListParents).toHaveBeenCalledTimes(2));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: STUDENT_PARENTS_KEY });
  });

  it("refetches my parents once a self-resend succeeds", async () => {
    mockResendMine.mockResolvedValue(undefined);
    const { qc, result } = await mount(() => ({
      list: useMyParents(),
      resend: useResendMyParentInvite(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    act(() => { result.current.resend.mutate("m-1"); });

    await waitFor(() => expect(mockListMine).toHaveBeenCalledTimes(2));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MY_PARENTS_KEY });
  });

  it("does not touch any cache when onboarding completes", async () => {
    // The response is a server-issued account: user id, auth token, refresh token,
    // redirect URL. None of it is predictable and none of it is cached — the page
    // navigates away. Faking anything here would be inventing an identity.
    mockOnboard.mockResolvedValue({ token: "jwt", user: { id: "u-1" } });
    const { qc, result } = await mount(() => ({
      list: useParentNotifications(),
      onboard: useCompleteParentOnboarding(),
    }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const before = qc.getQueryData(parentKeys.notifications());
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      result.current.onboard.mutate({ token: "t", password: "pw", name: "Maria" });
    });

    await waitFor(() => expect(result.current.onboard.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    expect(qc.getQueryData(parentKeys.notifications())).toBe(before);
  });
});

describe("#89 rule 3 — a list that has not loaded yet stays absent", () => {
  /**
   * The failure this guards against is a one-item flash: a mutation that finds no
   * cached list and helpfully writes `[theNewRow]` renders a panel showing exactly one
   * guardian, which then jumps to the full list the moment the real fetch lands.
   *
   * The subtle part is BUILDING the case. `setQueryData(key, undefined)` does not
   * register a query at all, so a test written that way asserts nothing — the filter
   * matches zero entries and the hook is never even given the chance to misbehave.
   * The real-world shape is a query that IS registered, with an observer, whose first
   * fetch is still in flight: `getQueryState` exists, `data` is undefined. So the read
   * hook is rendered against a queryFn that never settles and is deliberately NOT
   * awaited to success — and the registration is asserted, so the fixture cannot rot
   * back into the vacuous version without a test failing.
   */
  it("does not invent a parent list when the first fetch is still in flight", async () => {
    mockListParents.mockReset().mockImplementation(NEVER);
    mockInvite.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useStudentParents(STUDENT),
      invite: useInviteParent(),
    }));

    // Registered, observed, and genuinely data-less — the negative control that stops
    // this test from passing for the wrong reason.
    await waitFor(() => expect(qc.getQueryState(STUDENT_PARENTS_KEY)).toBeDefined());
    expect(result.current.list.isPending).toBe(true);
    expect(qc.getQueryData(STUDENT_PARENTS_KEY)).toBeUndefined();

    act(() => { result.current.invite.mutate(INVITE); });

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(qc.getQueryData(STUDENT_PARENTS_KEY)).toBeUndefined();
  });

  it("does not invent a notification list when the first fetch is still in flight", async () => {
    mockListNotifications.mockReset().mockImplementation(NEVER);
    mockMarkRead.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      list: useParentNotifications(),
      markRead: useMarkNotificationRead(),
    }));

    await waitFor(() => expect(qc.getQueryState(parentKeys.notifications())).toBeDefined());
    expect(result.current.list.isPending).toBe(true);

    act(() => { result.current.markRead.mutate("n-1"); });

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(qc.getQueryData(parentKeys.notifications())).toBeUndefined();
  });
});

describe("#89 the patch is scoped to the student it belongs to", () => {
  /**
   * `studentParentsFilter` prefix-matches `['parent','student-parents',studentId]`. If
   * that filter were ever widened — to `parentKeys.all`, say, which is the natural
   * "just invalidate everything" reflex — an invite sent from one student's panel would
   * splice a guardian into every other student's cached list, and a revoke would delete
   * a row the server keeps. Both are invisible in a single-student test.
   */
  const OTHER = "stu-2";
  const OTHER_KEY = ["parent", "student-parents", OTHER];

  const byStudent = () =>
    mockListParents.mockReset().mockImplementation((id: string) =>
      Promise.resolve(
        id === STUDENT ? [link("p-1"), link("p-2")] : [link("o-1"), link("o-2")],
      ),
    );

  it("does not add an invited guardian to another student's list", async () => {
    byStudent();
    mockInvite.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      mine: useStudentParents(STUDENT),
      other: useStudentParents(OTHER),
      invite: useInviteParent(),
    }));
    await waitFor(() => expect(result.current.mine.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.other.isSuccess).toBe(true));
    const otherBefore = qc.getQueryData(OTHER_KEY);

    act(() => { result.current.invite.mutate(INVITE); });

    // The invite landed where it belongs …
    await waitFor(() => expect(links(qc)).toHaveLength(3));
    // … and nowhere else. Same reference, so not even a re-render was spent on it.
    expect(qc.getQueryData(OTHER_KEY)).toBe(otherBefore);
    expect(links(qc, OTHER_KEY).map((p) => p.id)).toEqual(["o-1", "o-2"]);
  });

  it("does not remove a revoked guardian from another student's list", async () => {
    // Mirrors the server's predicate: the DELETE is scoped to (studentId, linkId), so
    // an id that happens to collide across students must survive on the other student.
    mockListParents
      .mockReset()
      .mockImplementation((id: string) =>
        Promise.resolve(
          id === STUDENT ? [link("dup"), link("p-2")] : [link("dup"), link("o-2")],
        ),
      );
    mockRevoke.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      mine: useStudentParents(STUDENT),
      other: useStudentParents(OTHER),
      revoke: useRevokeParentAccess(),
    }));
    await waitFor(() => expect(result.current.mine.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.other.isSuccess).toBe(true));

    act(() => {
      result.current.revoke.mutate({ studentId: STUDENT, parentLinkId: "dup" });
    });

    await waitFor(() => expect(links(qc).map((p) => p.id)).toEqual(["p-2"]));
    expect(links(qc, OTHER_KEY).map((p) => p.id)).toEqual(["dup", "o-2"]);
  });

  it("does not splice a self-invite into a student-parents list", async () => {
    // `myParentsFilter` and `studentParentsFilter` share the `['parent']` root, so a
    // filter written one segment short would match both.
    mockInviteMine.mockReturnValue(NEVER());
    const { qc, result } = await mount(() => ({
      mine: useMyParents(),
      admin: useStudentParents(STUDENT),
      invite: useInviteMyParent(),
    }));
    await waitFor(() => expect(result.current.mine.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.admin.isSuccess).toBe(true));
    const adminBefore = qc.getQueryData(STUDENT_PARENTS_KEY);

    act(() => {
      result.current.invite.mutate({
        name: "Maria Gonzalez",
        email: "maria@example.com",
        relationship: "mother",
      });
    });

    await waitFor(() => expect(links(qc, MY_PARENTS_KEY)).toHaveLength(3));
    expect(qc.getQueryData(STUDENT_PARENTS_KEY)).toBe(adminBefore);
  });
});
