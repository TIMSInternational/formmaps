/**
 * formmaps-platform#406 root cause: I18nProvider rendered `<>{children}</>` before i18n was
 * "loaded" and `<><SkipLink/><LanguageSync/>{children}</>` after. The child's
 * position in the fragment changed (index 0 → 2), so React unmounted and
 * re-mounted the WHOLE app once the /user/settings fetch resolved — every
 * page (incl. the resume PDF preview) started its loading pipeline over.
 */
import { render, act, waitFor } from "@testing-library/react";
import { useEffect } from "react";

const mockApiRequest = jest.fn();
jest.mock("@/lib/api/apiClient", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({
    language: "spanish",
    setLanguage: jest.fn(),
    user: { isAuthenticated: true },
  }),
}));

import { I18nProvider } from "../I18nProvider";

describe("I18nProvider", () => {
  it("does not re-mount the app tree once language settings finish loading", async () => {
    let resolveSettings: (v: unknown) => void = () => {};
    mockApiRequest.mockReturnValue(
      new Promise((r) => {
        resolveSettings = r;
      })
    );
    let mounts = 0;
    function Child() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <div>app</div>;
    }

    render(
      <I18nProvider>
        <Child />
      </I18nProvider>
    );
    expect(mounts).toBe(1);

    await act(async () => {
      resolveSettings({ data: { language: "es" } });
    });
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());

    expect(mounts).toBe(1);
  });
});
