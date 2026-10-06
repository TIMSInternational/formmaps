import type { LegalDocumentKey } from "./versions";

export type LegalLocale = "en" | "es";

/**
 * Body text supports two inline marks, nothing else:
 *   **bold**            → <strong>
 *   [label](href)       → link (internal path, https:// URL or mailto:)
 * Keeping the markup this small keeps the documents readable as plain data for counsel review.
 */
export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

export interface LegalSection {
  /** Stable anchor id; MUST be identical across languages (tested). */
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocumentContent {
  key: LegalDocumentKey;
  locale: LegalLocale;
  title: string;
  /** One-paragraph plain-language summary shown above the table of contents. */
  summary: string;
  sections: LegalSection[];
}
