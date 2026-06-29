/**
 * TDD: useSetLanguage hook + applyLanguage helper
 *
 * useSetLanguage verifies ALL THREE side effects:
 *   1. i18n.changeLanguage(lang)
 *   2. store.setLanguage("spanish"|"english")
 *   3. PUT /api/v1/user/settings { language: lang }
 *
 * applyLanguage verifies ONLY the write-free path (1 + 2, NO PUT):
 *   1. store.setLanguage("spanish"|"english")
 *   2. i18n.changeLanguage(lang)
 */

import { renderHook, act } from "@testing-library/react";

// --- Mocks ---

const mockChangeLanguage = jest.fn().mockResolvedValue(undefined);
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: mockChangeLanguage, language: "en" },
  }),
}));

// Mock the i18n instance imported directly by applyLanguage.
jest.mock("@/lib/i18n", () => ({
  __esModule: true,
  default: { changeLanguage: mockChangeLanguage, language: "en" },
}));

const mockSetLanguage = jest.fn();
const mockGetState = jest.fn(() => ({ language: "english", setLanguage: mockSetLanguage }));

jest.mock("@/store/useGlobalStore", () => {
  const hook = (selector: (s: { language: string; setLanguage: jest.Mock }) => unknown) =>
    selector({ language: "english", setLanguage: mockSetLanguage });
  hook.getState = mockGetState;
  return { useGlobalStore: hook };
});

const mockApiRequest = jest.fn().mockResolvedValue({ data: {} });
jest.mock("@/lib/api/apiClient", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

// --- Imports (after mocks) ---

import { useSetLanguage, applyLanguage } from "../useSetLanguage";

beforeEach(() => {
  jest.clearAllMocks();
  // Default getState returns english so "en" won't trigger setLanguage (guard passes).
  mockGetState.mockReturnValue({ language: "english", setLanguage: mockSetLanguage });
  // Default i18n.language is "en" so "es" will trigger changeLanguage.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const i18nMock = require("@/lib/i18n").default;
  i18nMock.language = "en";
});

// ------------------------------------------------------------------ //
//  useSetLanguage (user-initiated: PUT included)                      //
// ------------------------------------------------------------------ //

describe("useSetLanguage", () => {
  it("calling with 'es' triggers changeLanguage('es'), store.setLanguage('spanish'), and PUT settings", async () => {
    const { result } = renderHook(() => useSetLanguage());
    const setLang = result.current;

    await act(async () => {
      await setLang("es");
    });

    expect(mockChangeLanguage).toHaveBeenCalledWith("es");
    expect(mockSetLanguage).toHaveBeenCalledWith("spanish");
    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/v1/user/settings",
      expect.objectContaining({ method: "PUT", data: { language: "es" } })
    );
  });

  it("calling with 'en' triggers changeLanguage('en'), store.setLanguage('english'), and PUT settings", async () => {
    const { result } = renderHook(() => useSetLanguage());
    const setLang = result.current;

    await act(async () => {
      await setLang("en");
    });

    expect(mockChangeLanguage).toHaveBeenCalledWith("en");
    expect(mockSetLanguage).toHaveBeenCalledWith("english");
    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/v1/user/settings",
      expect.objectContaining({ method: "PUT", data: { language: "en" } })
    );
  });

  it("PUT failure does not throw (fire-and-forget persistence)", async () => {
    mockApiRequest.mockRejectedValueOnce(new Error("network error"));
    const { result } = renderHook(() => useSetLanguage());
    const setLang = result.current;

    // Should NOT throw even when the PUT fails
    await act(async () => {
      await expect(setLang("es")).resolves.toBeUndefined();
    });

    // i18n and store still updated despite network error
    expect(mockChangeLanguage).toHaveBeenCalledWith("es");
    expect(mockSetLanguage).toHaveBeenCalledWith("spanish");
  });
});

// ------------------------------------------------------------------ //
//  applyLanguage (write-free hydration path — NO PUT)                //
// ------------------------------------------------------------------ //

describe("applyLanguage", () => {
  it("applies 'es': updates store to 'spanish' and calls changeLanguage('es') — no PUT", () => {
    // Store currently has "english", i18n.language is "en" → both guards trigger.
    applyLanguage("es");

    expect(mockSetLanguage).toHaveBeenCalledWith("spanish");
    expect(mockChangeLanguage).toHaveBeenCalledWith("es");
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("applies 'en': updates store to 'english' and calls changeLanguage('en') — no PUT", () => {
    // Store currently has "english" (same value) → store guard skips setLanguage.
    // i18n.language is "en" (same value) → i18n guard skips changeLanguage.
    applyLanguage("en");

    expect(mockSetLanguage).not.toHaveBeenCalled();
    expect(mockChangeLanguage).not.toHaveBeenCalled();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("skips store update when store value already matches", () => {
    // Store already has "spanish" — guard should prevent redundant setLanguage.
    mockGetState.mockReturnValue({ language: "spanish", setLanguage: mockSetLanguage });
    applyLanguage("es");

    expect(mockSetLanguage).not.toHaveBeenCalled();
    // changeLanguage still fires because i18n.language is "en" (differs from "es").
    expect(mockChangeLanguage).toHaveBeenCalledWith("es");
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("skips changeLanguage when i18n is already on the target language", () => {
    // i18n is already "es" — guard should prevent redundant changeLanguage.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const i18nMock = require("@/lib/i18n").default;
    i18nMock.language = "es";
    // Store has "english" → setLanguage guard triggers.
    applyLanguage("es");

    expect(mockSetLanguage).toHaveBeenCalledWith("spanish");
    expect(mockChangeLanguage).not.toHaveBeenCalled();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});
