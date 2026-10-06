/**
 * formmaps-platform#405: the browser tab title stayed English ("FormMaps - Find your path.
 * Shape your future.") in Spanish — Next's static metadata is English-only,
 * so LanguageSync localizes the default title client-side.
 */
import { render, act, waitFor } from "@testing-library/react";
import i18n from "@/lib/i18n";
import { LanguageSync } from "../LanguageSync";

const EN_TITLE = "FormMaps - Find your path. Shape your future.";
const ES_TITLE = "FormMaps - Encuentra tu camino. Construye tu futuro.";

describe("LanguageSync document title", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it("localizes the default title in Spanish and restores it in English", async () => {
    document.title = EN_TITLE;
    await act(async () => {
      await i18n.changeLanguage("es");
    });
    render(<LanguageSync />);
    expect(document.title).toBe(ES_TITLE);
    expect(document.documentElement.lang).toBe("es");

    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(document.title).toBe(EN_TITLE);
  });

  it("re-localizes when Next resets the title on navigation", async () => {
    await act(async () => {
      await i18n.changeLanguage("es");
    });
    render(<LanguageSync />);
    document.title = EN_TITLE;
    await waitFor(() => expect(document.title).toBe(ES_TITLE));
  });

  it("leaves page-specific titles alone", async () => {
    document.title = "Profile | Dashboard";
    await act(async () => {
      await i18n.changeLanguage("es");
    });
    render(<LanguageSync />);
    expect(document.title).toBe("Profile | Dashboard");
  });
});
