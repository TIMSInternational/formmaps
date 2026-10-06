/**
 * Timezone-safe CALENDAR-DAY helpers + locale-aware date formatting.
 *
 * Date-only values (deadlines, due dates, start/end dates) arrive from the API
 * as `"2026-12-15"` or `"2026-12-15T00:00:00Z"`. `new Date(value)` turns them
 * into UTC midnight, and local getters (`getDate()`, `toLocaleDateString()`)
 * then read the PREVIOUS day anywhere west of UTC (Costa Rica, Colombia, all
 * of the US) — #394. Everything here reads the calendar day without any
 * timezone shift, then formats it with `Intl.DateTimeFormat(locale)` pinned to
 * UTC so the printed day is the stored day for every viewer.
 *
 * Keep this module dependency-free: its tests execute it in child processes
 * under several `TZ` values.
 */

export type DateLike = string | number | Date | null | undefined;

// "YYYY-MM-DD…" or a month-only "YYYY-MM" (portfolio start/end dates → day 1).
const YMD_PREFIX = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:$|[T ])/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`;
}

/**
 * The `YYYY-MM-DD` calendar day of a date-only value, with no timezone shift.
 *
 * - `"2026-12-15"` / `"2026-12-15T00:00:00Z"` / `"2026-12-15T00:00:00.000Z"`
 *   → `"2026-12-15"` (the stored day, in every timezone); `"2024-09"` → `"2024-09-01"`.
 * - A `Date` (or epoch ms) at exactly UTC midnight is treated as a date-only
 *   value and read with UTC getters; any other `Date` is a local moment (e.g.
 *   `new Date(y, m, d)` from a calendar grid) and is read with local getters.
 * - Anything empty or unparseable → `null`.
 */
export function toCalendarDay(value: DateLike): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const m = YMD_PREFIX.exec(value.trim());
    if (m) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 1];
      // Reject impossible days like 2026-02-31.
      const check = new Date(Date.UTC(y, mo - 1, d));
      if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
      return ymd(y, mo, d);
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  const t = date.getTime();
  if (Number.isNaN(t)) return null;

  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  return isUtcMidnight
    ? ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    : ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** `"YYYY-MM-DD"` key of a LOCAL `Date` (e.g. a cell of a calendar grid). */
export function localDayKey(date: Date): string {
  return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function dayToUtcDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function safeLocale(locale: string | undefined): string {
  if (!locale) return "en";
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(locale).length ? locale : "en";
  } catch {
    return "en";
  }
}

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

/**
 * Format a date-only value in `locale` (the app's current i18n language,
 * e.g. `i18n.language`). `"2026-12-15"` → `"Dec 15, 2026"` (en) /
 * `"15 dic 2026"` (es). Empty/invalid → `fallback` (default `"—"`).
 */
export function formatDate(
  value: DateLike,
  locale: string | undefined,
  opts: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTS,
  fallback = "—",
): string {
  const day = toCalendarDay(value);
  if (!day) return fallback;
  return new Intl.DateTimeFormat(safeLocale(locale), { ...opts, timeZone: "UTC" }).format(
    dayToUtcDate(day),
  );
}

/** Month + year of a date-only value: `"Feb 2024"` (en) / `"feb 2024"` (es). */
export function formatMonthYear(
  value: DateLike,
  locale: string | undefined,
  month: "short" | "long" = "short",
  fallback = "—",
): string {
  return formatDate(value, locale, { month, year: "numeric" }, fallback);
}
