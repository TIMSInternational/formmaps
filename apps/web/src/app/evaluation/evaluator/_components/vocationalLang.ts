import { toContentLanguage } from "@/lib/i18n/contentLanguage";
import type { VocationalLang, VocationalOption } from "@/services/vocationalTakeService";

/**
 * UI language (i18next code like "es", "es-CO", "en-US", or the store's "spanish"/"english") → the
 * questionnaire language the API serves. Spanish only for Spanish; everything else is English.
 */
export function toVocationalLang(language: string | null | undefined): VocationalLang {
  return toContentLanguage(language);
}

/**
 * `?lang=` from an emailed invite link → "es" | "en", or null when absent/unrecognised
 * (then the evaluator keeps whatever language i18next already resolved).
 */
export function langFromQuery(raw: string | null | undefined): VocationalLang | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value.startsWith("es")) return "es";
  if (value.startsWith("en")) return "en";
  return null;
}

/**
 * The option text to show. Prefers the server-resolved `label`; falls back per option to the English/Spanish
 * source labels so an older backend (no `label`) still renders correctly.
 */
export function optionLabel(option: VocationalOption, lang: VocationalLang): string {
  if (option.label) return option.label;
  if (lang === "en" && option.labelEn) return option.labelEn;
  return option.labelEs;
}
