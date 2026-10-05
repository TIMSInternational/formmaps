import { useTranslation } from "react-i18next";

/**
 * THE language source for anything a person reads: assessment instructions, questions, results.
 *
 * It is i18next's resolved language — the language the UI is actually rendering. The persisted
 * store preference (`"english" | "spanish"`) and the DB setting both feed i18next (I18nProvider),
 * so reading them directly can disagree with the screen for a moment or for good; that is how a
 * student got English instructions over a Spanish assessment. Derive content language from here,
 * and pass it to the API through `toApiLanguage` / `toStoreLanguage` where a legacy code is needed.
 */
export type ContentLanguage = "en" | "es";

/** Any language value we meet ("es", "es-CO", "en-US", "spanish", "sp", undefined) → "es" | "en". */
export function toContentLanguage(value: string | null | undefined): ContentLanguage {
  const v = (value ?? "").trim().toLowerCase();
  return v.startsWith("es") || v.startsWith("sp") ? "es" : "en";
}

/** The UI's current language, re-rendering when it changes. */
export function useContentLanguage(): ContentLanguage {
  const { i18n } = useTranslation();
  return toContentLanguage(i18n.resolvedLanguage || i18n.language);
}

/** The legacy TIMS/Node APIs' code: Spanish is "sp", not "es". */
export function toApiLanguage(lang: ContentLanguage): "sp" | "en" {
  return lang === "es" ? "sp" : "en";
}

/** The older service signatures that still take the store's spelling. */
export function toStoreLanguage(lang: ContentLanguage): "spanish" | "english" {
  return lang === "es" ? "spanish" : "english";
}
