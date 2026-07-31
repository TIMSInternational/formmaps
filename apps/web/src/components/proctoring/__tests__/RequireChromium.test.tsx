import { render, screen } from "@testing-library/react";
import { isChromium, RequireChromium } from "../RequireChromium";

jest.mock("react-i18next", () => {
  const en = require("@/lib/i18n/locales/en/common.json");
  const get = (k: string) => k.split(".").reduce((o: unknown, p: string) => (o == null ? o : (o as Record<string, unknown>)[p]), en);
  return {
    useTranslation: () => ({
      t: (k: string) => {
        const v = get(k);
        return typeof v === "string" ? v : k;
      },
      i18n: { language: "en" },
    }),
  };
});

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function setUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => ua });
}

describe("isChromium", () => {
  it("returns true for Chrome and Edge", () => {
    expect(isChromium(CHROME)).toBe(true);
    expect(isChromium(EDGE)).toBe(true);
  });

  it("returns false for Firefox and Safari", () => {
    expect(isChromium(FIREFOX)).toBe(false);
    expect(isChromium(SAFARI)).toBe(false);
  });

  it("returns false for an empty UA", () => {
    expect(isChromium("")).toBe(false);
  });
});

describe("RequireChromium", () => {
  it("renders children on a Chromium browser", () => {
    setUA(CHROME);
    render(
      <RequireChromium>
        <div data-testid="runner">exam</div>
      </RequireChromium>,
    );
    expect(screen.getByTestId("runner")).toBeInTheDocument();
  });

  it("hides children and shows the gate on an unsupported browser", () => {
    setUA(FIREFOX);
    render(
      <RequireChromium>
        <div data-testid="runner">exam</div>
      </RequireChromium>,
    );
    expect(screen.queryByTestId("runner")).not.toBeInTheDocument();
    expect(screen.getByText(/Chrome or Edge required/i)).toBeInTheDocument();
  });
});
