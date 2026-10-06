/**
 * AuthWrapper remounts the page on logout / account switch (so one person's in-memory state never
 * reaches the next) but NOT when someone signs in from anonymous — that remount re-ran the invite
 * page's token check against the token it had just consumed ("invitation link not valid").
 */
import { render, act } from "@testing-library/react";
import { useEffect } from "react";
import { AuthWrapper } from "../AuthWrapper";

type User = { id: string | null; isAuthenticated: boolean; role: string | null; schoolId?: string | null };
let mockUser: User = { id: null, isAuthenticated: false, role: null };
const listeners = new Set<() => void>();
jest.mock("@/store/useGlobalStore", () => {
  const React = require("react");
  const initializeAuth = async () => {}; // stable, like the real zustand action
  const useGlobalStore = () => {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
    return { user: mockUser, initializeAuth };
  };
  useGlobalStore.persist = { onFinishHydration: () => () => {}, hasHydrated: () => true };
  return { useGlobalStore };
});
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }), usePathname: () => "/onboarding/invite/tok" }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock("@/hooks/useSubscription", () => ({ useSubscriptionStatus: () => ({ data: undefined, isLoading: false, isError: false, isFetching: false }) }));
jest.mock("@/hooks/useTokenMonitor", () => ({ useTokenMonitor: () => {} }));
jest.mock("@/hooks/usePermission", () => ({ usePermission: () => ({ role: "student", isStudent: true }) }));
jest.mock("@/hooks/useUserPermissions", () => ({ useUserPermissions: () => {} }));
jest.mock("@/components/session/SessionTimeout", () => ({ SessionTimeout: () => null }));
jest.mock("@/lib/sentry", () => ({ initSentry: () => {} }));
jest.mock("@/lib/webVitals", () => ({ reportWebVitals: () => {} }));

let mounts = 0;
function Page() {
  useEffect(() => { mounts += 1; }, []);
  return <div>page</div>;
}
function setUser(u: User) {
  mockUser = u;
  act(() => { listeners.forEach((f) => f()); });
}

beforeEach(() => { mounts = 0; mockUser = { id: null, isAuthenticated: false, role: null }; });

it("signing in from anonymous keeps the page mounted (the invite page keeps its state)", async () => {
  await act(async () => { render(<AuthWrapper><Page /></AuthWrapper>); });
  expect(mounts).toBe(1);
  setUser({ id: "u1", isAuthenticated: true, role: "student" });
  expect(mounts).toBe(1);
});

it("logout and switching accounts remount it (no state crosses accounts)", async () => {
  mockUser = { id: "u1", isAuthenticated: true, role: "student" };
  await act(async () => { render(<AuthWrapper><Page /></AuthWrapper>); });
  expect(mounts).toBe(1);
  setUser({ id: "u2", isAuthenticated: true, role: "student" });
  expect(mounts).toBe(2);
  setUser({ id: null, isAuthenticated: false, role: null });
  expect(mounts).toBe(3);
});
