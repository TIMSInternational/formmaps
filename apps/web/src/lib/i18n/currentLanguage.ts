import i18nInstance from "@/lib/i18n";
import { toContentLanguage, type ContentLanguage } from "./contentLanguage";

/** The UI's current language, outside React (see contentLanguage.ts). Anything that isn't Spanish is English. */
export function currentLanguage(): ContentLanguage {
  return toContentLanguage(i18nInstance.resolvedLanguage || i18nInstance.language || "en");
}
