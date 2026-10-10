import type { TFunction } from "i18next";

/**
 * Generated student alerts store English title/message plus, in `details`, a translation key and params
 * (formmaps-platform api/src/lib/alertI18n.ts). This renders them in the viewer's language; free-text
 * alerts and rows written before the key existed keep their stored text.
 */
export interface AlertI18n { key: string; params: Record<string, string | number> }

export function alertI18nOf(details: unknown): AlertI18n | null {
  let value: unknown = details;
  if (typeof value === "string") {
    if (!value.startsWith("{")) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  const i18n = (value as { i18n?: { key?: unknown; params?: unknown } } | null)?.i18n;
  if (!i18n || typeof i18n.key !== "string" || !i18n.key) return null;
  const params = i18n.params && typeof i18n.params === "object" ? (i18n.params as AlertI18n["params"]) : {};
  return { key: i18n.key, params };
}

/** "2026-06-01" as a short date in the viewer's language; anything else unchanged. */
function day(value: string | number, language: string): string | number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(language.startsWith("es") ? "es" : "en", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

export function localizeAlert(
  alert: { title?: string | null; message?: string | null; details?: unknown },
  t: TFunction,
  language: string,
): { title: string; message: string } {
  const fallback = { title: alert.title ?? alert.message ?? "", message: alert.message ?? "" };
  const i18n = alertI18nOf(alert.details);
  if (!i18n) return fallback;
  const base = `alertsGenerated.${i18n.key}`;
  const params = Object.fromEntries(Object.entries(i18n.params).map(([k, v]) => [k, k === "date" ? day(v, language) : v]));
  return {
    title: t(`${base}.title`, { ns: "common", defaultValue: fallback.title, ...params }) as string,
    message: t(`${base}.message`, { ns: "common", defaultValue: fallback.message, ...params }) as string,
  };
}
