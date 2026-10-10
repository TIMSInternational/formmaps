/**
 * The UI language for a visitor with no stored choice. The first entry in the browser's preference
 * list that is Spanish or English wins (es-CO → es, en-GB → en). A browser in any other language
 * gets Spanish — the same default as every email (formmaps-platform api/src/lib/emailLanguage.ts,
 * rule 4: FormMaps' audience is Colombian), so the login page and the invitation that led to it agree.
 */
export const DEFAULT_UI_LANGUAGE = "es" as const;

export function pickBrowserLanguage(preferred: readonly (string | null | undefined)[]): "en" | "es" {
  for (const raw of preferred) {
    const code = (raw || "").trim().toLowerCase();
    if (code === "es" || code.startsWith("es-")) return "es";
    if (code === "en" || code.startsWith("en-")) return "en";
  }
  return DEFAULT_UI_LANGUAGE;
}

/** i18next-browser-languagedetector custom detector over navigator.languages. */
export const browserLanguageDetector = {
  name: "formmapsNavigator",
  lookup(): string | undefined {
    if (typeof navigator === "undefined") return undefined;
    const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    return pickBrowserLanguage(list);
  },
};
