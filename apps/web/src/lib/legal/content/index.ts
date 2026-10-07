import type { LegalDocumentKey } from "../versions";
import type { LegalDocumentContent, LegalLocale } from "../types";
import { termsEn } from "./en/terms";
import { privacyEn } from "./en/privacy";
import { refundsEn } from "./en/refunds";
import { cookiesEn } from "./en/cookies";
import { parentalConsentEn } from "./en/parental-consent";
import { termsEs } from "./es/terms";
import { privacyEs } from "./es/privacy";
import { refundsEs } from "./es/refunds";
import { cookiesEs } from "./es/cookies";
import { parentalConsentEs } from "./es/parental-consent";

/** Every legal document in every language. Both languages are complete; there is no fallback. */
export const LEGAL_DOCUMENTS: Record<LegalLocale, Record<LegalDocumentKey, LegalDocumentContent>> = {
  en: {
    terms: termsEn,
    privacy: privacyEn,
    refunds: refundsEn,
    cookies: cookiesEn,
    "parental-consent": parentalConsentEn,
  },
  es: {
    terms: termsEs,
    privacy: privacyEs,
    refunds: refundsEs,
    cookies: cookiesEs,
    "parental-consent": parentalConsentEs,
  },
};

export function getLegalDocument(key: LegalDocumentKey, locale: LegalLocale): LegalDocumentContent {
  return LEGAL_DOCUMENTS[locale][key];
}
