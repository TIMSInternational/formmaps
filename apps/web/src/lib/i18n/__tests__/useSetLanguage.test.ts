/**
 * TDD: useSetLanguage hook
 *
 * Verifies that the returned fn triggers ALL THREE side effects:
 *   1. i18n.changeLanguage(lang)
 *   2. store.setLanguage("spanish"|"english")
 *   3. PUT /api/v1/user/settings { language: lang }
 */

import { renderHook, act } from "@testing-library/react";

// --- Mocks ---

const mockChangeLanguage = jest.fn().mockResolvedValue(undefined);
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: mockChangeLanguage, language: "en" },
  }),
}));

const mockSetLanguage = jest.fn();
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: (selector: (s: { language: string; setLanguage: jest.Mock }) => unknown) =>
    selector({ language: "english", setLanguage: mockSetLanguage }),
}));

const mockApiRequest = jest.fn().mockResolvedValue({ data: {} });
jest.mock("@/lib/api/apiClient", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

// --- Tests ---

import { useSetLanguage } from "../useSetLanguage";

beforeEach(() => {
  jest.clearAllMocks();
});

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
