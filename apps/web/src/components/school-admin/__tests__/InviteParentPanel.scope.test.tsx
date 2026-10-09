/**
 * audit 2026-10-09 C9: the counselor student page's Parents tab rendered this panel against the
 * school-admin routes (school:manage → 403 for every counselor). With scope="counselor" the panel
 * reads/invites/resends through the caseload-checked routes and hides revoke (not open to
 * counselors). The default stays school-admin, and the counselor page passes the counselor scope.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { InviteParentPanel } from "../InviteParentPanel";
import {
  useStudentParents,
  useInviteParent,
  useResendParentInvite,
} from "@/hooks/useParentPortalQueries";

jest.mock("motion/react", () => {
  const React = require("react");
  const passthrough = new Proxy({}, { get: (_t, tag: string) => React.forwardRef((p: Record<string, unknown>, ref: unknown) => {
    const { initial: _i, animate: _a, exit: _e, transition: _tr, whileHover: _wh, whileTap: _wt, layout: _l, ...rest } = p;
    return React.createElement(tag, { ...rest, ref });
  }) });
  return { motion: passthrough, AnimatePresence: ({ children }: { children: unknown }) => children };
});

const mutation = { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false };
jest.mock("@/hooks/useParentPortalQueries", () => ({
  useStudentParents: jest.fn(),
  useInviteParent: jest.fn(),
  useRevokeParentAccess: jest.fn(),
  useResendParentInvite: jest.fn(),
}));

const pendingRow = { id: "l-1", name: "Mom Parent", email: "mom@x.com", relationship: "mother", status: "pending", invitedAt: "2026-01-01" };

// The title is the translated label or, when i18n is not initialised in jsdom, the key itself.
const revokeButton = () =>
  document.querySelector('[title="Revoke access"], [title="components.inviteParentPanel.revokeAccess"]');
const resendButton = () =>
  document.querySelector('[title="Resend invite"], [title="components.inviteParentPanel.resendInvite"]');

beforeEach(() => {
  jest.clearAllMocks();
  const hooks = jest.requireMock("@/hooks/useParentPortalQueries");
  hooks.useStudentParents.mockReturnValue({ data: [pendingRow], isLoading: false });
  hooks.useInviteParent.mockReturnValue(mutation);
  hooks.useRevokeParentAccess.mockReturnValue(mutation);
  hooks.useResendParentInvite.mockReturnValue(mutation);
});

it("counselor scope uses the counselor hooks and hides revoke", () => {
  render(<InviteParentPanel studentId="s-1" studentName="Kid" scope="counselor" />);
  expect(useStudentParents).toHaveBeenCalledWith("s-1", "counselor");
  expect(useInviteParent).toHaveBeenCalledWith("counselor");
  expect(useResendParentInvite).toHaveBeenCalledWith("counselor");
  expect(screen.getByText("Mom Parent")).toBeInTheDocument();
  expect(resendButton()).not.toBeNull(); // the selector itself works (not a vacuous null)
  expect(revokeButton()).toBeNull();
});

it("defaults to the school-admin scope with revoke available", () => {
  render(<InviteParentPanel studentId="s-1" studentName="Kid" />);
  expect(useStudentParents).toHaveBeenCalledWith("s-1", "school-admin");
  expect(useInviteParent).toHaveBeenCalledWith("school-admin");
  expect(revokeButton()).not.toBeNull();
});

it("the counselor student page renders the panel in counselor scope", () => {
  const page = fs.readFileSync(path.join(__dirname, "../../../app/counselor/students/[id]/page.tsx"), "utf8");
  expect(page).toMatch(/<InviteParentPanel[^>]*scope="counselor"/);
});
