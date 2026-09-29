import i18nInstance from "@/lib/i18n";

/**
 * The UI's current language as the two codes the API understands. Used where a request
 * produces something a PERSON reads later — an invitation email — so it arrives in the
 * language the sender was working in. Anything that isn't Spanish is English.
 */
export function currentLanguage(): "en" | "es" {
  const lang = (i18nInstance.resolvedLanguage || i18nInstance.language || "en").toLowerCase();
  return lang.startsWith("es") ? "es" : "en";
}
