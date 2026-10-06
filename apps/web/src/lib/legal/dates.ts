import type { LegalLocale } from "./types";

/** "2026-10-15" → "October 15, 2026" / "15 de octubre de 2026". UTC so no time zone shifts the day. */
export function formatLegalDate(isoDate: string, locale: LegalLocale): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale === "es" ? "es" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}
