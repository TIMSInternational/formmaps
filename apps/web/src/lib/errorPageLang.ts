/**
 * Language for error pages that render without the i18n provider (app/global-error.tsx): the saved i18next
 * language, else the browser's, else English. Never throws — storage can be blocked.
 */
export function pickErrorPageLang(): "en" | "es" {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("i18nextLng") || navigator.language || "" : "";
    if (raw.toLowerCase().startsWith("es")) return "es";
  } catch {
    /* storage blocked — English */
  }
  return "en";
}
