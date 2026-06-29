/**
 * TDD: authService.login — language payload wiring
 *
 * Verifies that when the login API response includes a `language` field,
 * `applyLanguage` is called with the correct locale code so the UI
 * immediately renders in the user's preferred language.
 */

// --- Mocks (must precede imports) ---

const mockApplyLanguage = jest.fn();
jest.mock("@/lib/i18n/useSetLanguage", () => ({
  applyLanguage: (...args: unknown[]) => mockApplyLanguage(...args),
}));

const mockStoreTokens = jest.fn();
const mockClearTokens = jest.fn();
jest.mock("@/services/tokenRefreshService", () => ({
  storeTokens: (...args: unknown[]) => mockStoreTokens(...args),
  clearTokens: (...args: unknown[]) => mockClearTokens(...args),
}));

// Helper to produce a minimal valid login API response
function makeLoginResponse(language?: string) {
  return {
    success: true,
    data: {
      token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwiZXhwIjo5OTk5OTk5OTk5fQ.signature",
      refreshToken: undefined,
      language,
      user: {
        id: "u1",
        name: "Test User",
        email: "test@example.com",
        roleId: "r1",
        roleName: "student",
        permissions: [],
      },
    },
  };
}

// Stub global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// --- Imports (after mocks) ---
import { login } from "../authService";

beforeEach(() => {
  jest.clearAllMocks();
});

// ------------------------------------------------------------------ //
//  login — language wiring                                           //
// ------------------------------------------------------------------ //

describe("login — language payload wiring", () => {
  it("calls applyLanguage('es') when login response contains language:'es'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeLoginResponse("es"),
    });

    await login("user@example.com", "password");

    expect(mockApplyLanguage).toHaveBeenCalledWith("es");
    expect(mockApplyLanguage).toHaveBeenCalledTimes(1);
  });

  it("calls applyLanguage('en') when login response contains language:'en'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeLoginResponse("en"),
    });

    await login("user@example.com", "password");

    expect(mockApplyLanguage).toHaveBeenCalledWith("en");
    expect(mockApplyLanguage).toHaveBeenCalledTimes(1);
  });

  it("does NOT call applyLanguage when login response has no language field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeLoginResponse(undefined),
    });

    await login("user@example.com", "password");

    expect(mockApplyLanguage).not.toHaveBeenCalled();
  });

  it("does NOT call applyLanguage when login response has an unrecognized language", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeLoginResponse("fr"),
    });

    await login("user@example.com", "password");

    expect(mockApplyLanguage).not.toHaveBeenCalled();
  });
});
