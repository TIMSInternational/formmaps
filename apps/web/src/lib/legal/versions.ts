/**
 * The ONE place legal document versions live.
 *
 * Every consent the app records (signup, checkout) sends `{ key, version }` pairs taken from here,
 * and every public legal page prints its version from here, so what a person saw and what we stored
 * can never drift apart. To publish a revised document: edit its content modules
 * (`src/lib/legal/content/{en,es}/<doc>.ts`), then bump its entry below (and LEGAL_EFFECTIVE_DATE
 * if the whole set changes). A material change also needs re-acceptance (Terms §"Changes").
 */
export const LEGAL_EFFECTIVE_DATE = "2026-10-15";

export const LEGAL_DOCUMENT_VERSIONS = {
  terms: "2026-10-15",
  privacy: "2026-10-15",
  refunds: "2026-10-15",
  cookies: "2026-10-15",
  "parental-consent": "2026-10-15",
} as const;

export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENT_VERSIONS;

export const LEGAL_DOCUMENT_KEYS = Object.keys(LEGAL_DOCUMENT_VERSIONS) as LegalDocumentKey[];

/** Public route of each document. */
export const LEGAL_DOCUMENT_PATHS: Record<LegalDocumentKey, string> = {
  terms: "/terms",
  privacy: "/privacy",
  refunds: "/refunds",
  cookies: "/cookies",
  "parental-consent": "/parental-consent",
};
