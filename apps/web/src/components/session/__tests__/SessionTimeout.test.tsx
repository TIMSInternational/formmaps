import { act, fireEvent, render, screen } from "@testing-library/react";
import { SessionTimeout } from "@/components/session/SessionTimeout";
import { useGlobalStore } from "@/store/useGlobalStore";
import { hardNavigate } from "@/lib/session/navigate";
import { LAST_ACTIVITY_KEY, LOGOUT_BROADCAST_KEY } from "@/lib/session/sessionTimeout";

jest.mock("@/lib/session/navigate", () => ({ hardNavigate: jest.fn() }));
jest.mock("react-i18next", () => {
  const en = require("@/lib/i18n/locales/en/common.json");
  const get = (k: string) =>
    k.split(".").reduce((o: unknown, p: string) => (o == null ? o : (o as Record<string, unknown>)[p]), en);
  return {
    // The store imports lib/i18n, which registers this plugin at module load.
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: () => ({
      t: (k: string, opts?: Record<string, string>) =>
        String(get(k) ?? k).replace(/\{\{(\w+)\}\}/g, (_m, name) => opts?.[name] ?? ""),
    }),
  };
});

const T0 = new Date("2026-09-28T15:00:00Z").getTime();
const MIN = 60 * 1000;
const mockNavigate = hardNavigate as jest.Mock;
const mockLogout = jest.fn();

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
}
function signIn(authenticated = true) {
  useGlobalStore.setState((s) => ({
    user: { ...s.user, id: "u1", isAuthenticated: authenticated },
    assessmentActive: false,
    logout: mockLogout,
  }));
}
function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}
const idleTitle = () => screen.queryByText("You'll be signed out soon due to inactivity");
const expiryTitle = () => screen.queryByText("Your session is ending");

beforeEach(() => {
  jest.useFakeTimers({ now: T0 });
  jest.clearAllMocks();
  localStorage.clear();
  setCookie("logged_in", "true");
  clearCookie("session_expires_at");
  signIn();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("idle timeout", () => {
  it("warns at 28:00 of inactivity, with a live countdown", () => {
    render(<SessionTimeout />);
    advance(28 * MIN - 1000);
    expect(idleTitle()).toBeNull();
    advance(1000);
    expect(idleTitle()).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByTestId("session-countdown")).toHaveTextContent("Signing out in 2:00");
    advance(5000);
    expect(screen.getByTestId("session-countdown")).toHaveTextContent("Signing out in 1:55");
  });

  it("signs out at 30:00 and lands on /login?reason=idle", () => {
    render(<SessionTimeout />);
    advance(30 * MIN);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate.mock.calls[0][0]).toMatch(/^\/login\?reason=idle/);
    expect(JSON.parse(localStorage.getItem(LOGOUT_BROADCAST_KEY)!)).toMatchObject({ reason: "idle" });
  });

  it("'Stay signed in' resets the clock", () => {
    render(<SessionTimeout />);
    advance(28 * MIN);
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(idleTitle()).toBeNull();
    advance(27 * MIN);
    expect(idleTitle()).toBeNull();
    expect(mockLogout).not.toHaveBeenCalled();
    advance(1 * MIN);
    expect(idleTitle()).toBeInTheDocument();
  });

  it("activity in this tab keeps the session alive", () => {
    render(<SessionTimeout />);
    advance(20 * MIN);
    fireEvent.keyDown(window, { key: "a" });
    advance(20 * MIN);
    expect(idleTitle()).toBeNull();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("stray activity does not dismiss an open warning — only its buttons do", () => {
    render(<SessionTimeout />);
    advance(28 * MIN);
    fireEvent.pointerDown(window);
    advance(1000);
    expect(idleTitle()).toBeInTheDocument();
  });

  it("activity in ANOTHER tab (storage event) resets this one, and closes its warning", () => {
    render(<SessionTimeout />);
    advance(28 * MIN);
    expect(idleTitle()).toBeInTheDocument();
    act(() => {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      window.dispatchEvent(new StorageEvent("storage", { key: LAST_ACTIVITY_KEY }));
    });
    expect(idleTitle()).toBeNull();
    advance(20 * MIN);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("a sign-out in another tab signs this one out without re-broadcasting", () => {
    render(<SessionTimeout />);
    advance(5 * MIN);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: LOGOUT_BROADCAST_KEY,
        newValue: JSON.stringify({ reason: "idle", at: Date.now() }),
      }));
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate.mock.calls[0][0]).toMatch(/^\/login\?reason=idle/);
    expect(localStorage.getItem(LOGOUT_BROADCAST_KEY)).toBeNull();
  });

  it("uses copy that warns about unsaved answers during an assessment", () => {
    useGlobalStore.setState({ assessmentActive: true });
    render(<SessionTimeout />);
    advance(28 * MIN);
    expect(screen.getByText(/Unsaved answers may be lost/)).toBeInTheDocument();
  });
});

describe("absolute 12-hour deadline", () => {
  it("warns 2 minutes before the cookie deadline and signs out at it", () => {
    setCookie("session_expires_at", String(T0 + 10 * MIN));
    render(<SessionTimeout />);
    fireEvent.keyDown(window); // keep idle out of the way
    advance(8 * MIN - 1000);
    expect(expiryTitle()).toBeNull();
    advance(1000);
    expect(expiryTitle()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stay signed in" })).toBeNull();
    advance(2 * MIN);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate.mock.calls[0][0]).toMatch(/^\/login\?reason=expired/);
  });

  it("'Sign in again' signs out immediately with reason=expired", () => {
    setCookie("session_expires_at", String(T0 + 2 * MIN));
    render(<SessionTimeout />);
    advance(1000);
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(mockNavigate.mock.calls[0][0]).toMatch(/^\/login\?reason=expired/);
  });

  it("a missing or invalid cookie means idle only", () => {
    setCookie("session_expires_at", "garbage");
    render(<SessionTimeout />);
    advance(27 * MIN);
    expect(expiryTitle()).toBeNull();
    expect(idleTitle()).toBeNull();
    advance(1 * MIN);
    expect(idleTitle()).toBeInTheDocument();
  });

  it("catches a deadline that passed while the machine slept", () => {
    setCookie("session_expires_at", String(T0 + 60 * MIN));
    render(<SessionTimeout />);
    // Jump the wall clock without letting intervals fire, as a sleeping laptop does.
    act(() => {
      jest.setSystemTime(T0 + 90 * MIN);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(mockNavigate.mock.calls[0][0]).toMatch(/^\/login\?reason=expired/);
  });
});

describe("lifecycle", () => {
  it("runs no timers and renders nothing when signed out", () => {
    signIn(false);
    render(<SessionTimeout />);
    expect(jest.getTimerCount()).toBe(0);
    advance(60 * MIN);
    expect(mockLogout).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("runs no timers without the logged_in cookie, even if the store says authenticated", () => {
    clearCookie("logged_in");
    render(<SessionTimeout />);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("logs out exactly once when two tabs' broadcasts and the timer race", () => {
    render(<SessionTimeout />);
    advance(30 * MIN - 1);
    const broadcast = () =>
      window.dispatchEvent(new StorageEvent("storage", {
        key: LOGOUT_BROADCAST_KEY,
        newValue: JSON.stringify({ reason: "idle", at: Date.now() }),
      }));
    act(() => {
      broadcast();
      broadcast();
      jest.advanceTimersByTime(5000);
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it("does not inherit a stale last-activity value from before this sign-in", () => {
    // Left behind by an earlier session an hour ago; this session signed in just now.
    localStorage.setItem(LAST_ACTIVITY_KEY, String(T0 - 60 * MIN));
    setCookie("session_expires_at", String(T0 + 12 * 60 * MIN));
    render(<SessionTimeout />);
    advance(1000);
    expect(mockLogout).not.toHaveBeenCalled();
    expect(idleTitle()).toBeNull();
  });

  it("does sign out a returning user whose own last activity is over 30 minutes old", () => {
    setCookie("session_expires_at", String(T0 + 10 * 60 * MIN)); // signed in 2h ago
    localStorage.setItem(LAST_ACTIVITY_KEY, String(T0 - 45 * MIN));
    render(<SessionTimeout />);
    expect(mockNavigate.mock.calls[0][0]).toMatch(/^\/login\?reason=idle/);
  });
});
