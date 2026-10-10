/**
 * Audit F: the login page opened in English for anyone whose browser was not Spanish, while every
 * email defaults to Spanish. A visitor with no stored choice now gets the browser's Spanish/English
 * preference, and Spanish otherwise.
 */
import { pickBrowserLanguage, browserLanguageDetector, DEFAULT_UI_LANGUAGE } from "../browserLanguage";

describe("pickBrowserLanguage", () => {
  it("follows the first Spanish or English entry in the browser's order", () => {
    expect(pickBrowserLanguage(["es-CO", "en-US"])).toBe("es");
    expect(pickBrowserLanguage(["en-GB", "es"])).toBe("en");
    expect(pickBrowserLanguage(["pt-BR", "EN"])).toBe("en");
    expect(pickBrowserLanguage(["fr-FR", "es-419"])).toBe("es");
  });

  it("falls back to Spanish, the email default, when the browser is neither", () => {
    expect(DEFAULT_UI_LANGUAGE).toBe("es");
    expect(pickBrowserLanguage(["pt-BR", "fr"])).toBe("es");
    expect(pickBrowserLanguage([])).toBe("es");
    expect(pickBrowserLanguage([null, undefined, ""])).toBe("es");
    // "est" (Estonian) is not Spanish.
    expect(pickBrowserLanguage(["et", "esperanto"])).toBe("es");
    expect(pickBrowserLanguage(["eng"])).toBe("es");
  });

  it("the detector reads navigator.languages", () => {
    const spy = jest.spyOn(window.navigator, "languages", "get").mockReturnValue(["de-DE", "es-MX"]);
    expect(browserLanguageDetector.lookup()).toBe("es");
    spy.mockReturnValue(["fr-CA"]);
    expect(browserLanguageDetector.lookup()).toBe("es");
    spy.mockReturnValue(["en-US"]);
    expect(browserLanguageDetector.lookup()).toBe("en");
    spy.mockRestore();
  });
});

describe("the app's i18n instance", () => {
  it("uses the stored choice first, then this detector — never the stock navigator/htmlTag (English) chain", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const i18n = require("../index").default;
    expect(i18n.options.detection.order).toEqual(["localStorage", browserLanguageDetector.name]);
  });
});
