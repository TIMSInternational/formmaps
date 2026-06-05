import { forceLogout } from "@/utils/tokenUtils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { hardNavigate } from "@/utils/navigation";

// jsdom cannot perform navigation — mock the navigation boundary
jest.mock("@/utils/navigation", () => ({ hardNavigate: jest.fn() }));
const mockHardNavigate = hardNavigate as jest.Mock;

describe("forceLogout — full session teardown (prevents login↔dashboard reload loop)", () => {
  beforeEach(() => {
    mockHardNavigate.mockClear();
    document.cookie = "logged_in=true; path=/";
    useGlobalStore.getState().setUser({
      id: "u1",
      email: "student@formmaps.dev",
      name: "Test Student",
      role: "student",
      accessToken: "stale-but-well-formed-token",
    });
  });

  it("resets the persisted auth store so AuthWrapper cannot bounce back into the portal", () => {
    forceLogout();
    const user = useGlobalStore.getState().user;
    expect(user.isAuthenticated).toBe(false);
    expect(user.accessToken).toBeNull();
    expect(user.email).toBeNull();
  });

  it("clears the logged_in cookie", () => {
    forceLogout();
    expect(document.cookie).not.toContain("logged_in=true");
  });

  it("hard-navigates to /login", () => {
    forceLogout("Your session has expired. Please log in again.");
    expect(mockHardNavigate).toHaveBeenCalledWith("/login");
  });
});
