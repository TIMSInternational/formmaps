const mockClear = jest.fn();
jest.mock("@/components/QueryProvider", () => ({
  getQueryClient: () => ({ clear: mockClear }),
}));

import { resetClientState } from "../resetClientState";

describe("resetClientState", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockClear.mockClear();
  });

  it("wipes user-scoped and global assessment keys (including the persisted store + PII queue)", () => {
    localStorage.setItem("timcare-global-store", JSON.stringify({ state: { user: { id: "old-user" } } }));
    localStorage.setItem("mil_completed_exams", JSON.stringify(["a"]));
    localStorage.setItem("mil_session_exam-1", "{}");
    localStorage.setItem("formmaps_pending_mil_submissions", JSON.stringify([{ body: { userId: "old-user" } }]));
    localStorage.setItem("pcaData_old-user", "{}");
    localStorage.setItem("tims_profile_old-user", "{}");
    localStorage.setItem("formmaps_notifications", "[]");

    resetClientState();

    expect(localStorage.getItem("timcare-global-store")).toBeNull();
    expect(localStorage.getItem("mil_completed_exams")).toBeNull();
    expect(localStorage.getItem("mil_session_exam-1")).toBeNull();
    expect(localStorage.getItem("formmaps_pending_mil_submissions")).toBeNull();
    expect(localStorage.getItem("pcaData_old-user")).toBeNull();
    expect(localStorage.getItem("tims_profile_old-user")).toBeNull();
    expect(localStorage.getItem("formmaps_notifications")).toBeNull();
  });

  it("wipes ANY unknown/future key by default (allowlist semantics)", () => {
    localStorage.setItem("some_future_cache_key", "leaky");
    sessionStorage.setItem("another_cache", "leaky");

    resetClientState();

    expect(localStorage.getItem("some_future_cache_key")).toBeNull();
    expect(sessionStorage.getItem("another_cache")).toBeNull();
  });

  it("preserves device-level keys: language, consent, theme, and the login auth message", () => {
    localStorage.setItem("i18nextLng", "es");
    localStorage.setItem("telemetry_consent", "true");
    localStorage.setItem("admin-theme", "dark");
    sessionStorage.setItem("auth_message", "Your session has expired.");

    resetClientState();

    expect(localStorage.getItem("i18nextLng")).toBe("es");
    expect(localStorage.getItem("telemetry_consent")).toBe("true");
    expect(localStorage.getItem("admin-theme")).toBe("dark");
    expect(sessionStorage.getItem("auth_message")).toBe("Your session has expired.");
  });

  it("clears the React Query cache", () => {
    resetClientState();
    expect(mockClear).toHaveBeenCalledTimes(1);
  });
});
