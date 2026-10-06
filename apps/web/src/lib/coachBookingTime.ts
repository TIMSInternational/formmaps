/**
 * Pure time helpers for the coach booking modal (#404).
 *
 * The slots API returns real UTC instants (ISO strings). What the student
 * sees must be those instants in THEIR timezone; the coach's wall-clock is
 * only a secondary hint. The booking payload keeps sending the untouched
 * instants, so nothing here ever feeds back into what is submitted.
 */

type TFunction = (key: string, opts?: Record<string, unknown>) => string;

/** "30-minute session" / "1-hour session" / "2-hour session" via i18n. */
export function sessionDurationLabel(
  minutes: number | undefined,
  t: TFunction,
): string | null {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1
      ? t("booking.sessionHour", { count: 1 })
      : t("booking.sessionHours", { count: hours });
  }
  return t("booking.sessionMinutes", { count: minutes });
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Format a UTC instant as "hh:mma" (e.g. "08:00am") in an explicit IANA zone. */
export function formatSlotTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    const parts = timeFormatter(timeZone).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    // Some ICU builds emit "24" for midnight with hour12 — normalise to "12".
    const hour = get("hour") === "00" || get("hour") === "24" ? "12" : get("hour");
    return `${hour.padStart(2, "0")}:${get("minute")}${get("dayPeriod").toLowerCase()}`;
  } catch {
    return iso;
  }
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The student's zone: a valid profile tz if the app has one, else the browser's. */
export function resolveStudentTimeZone(profileTimeZone?: string | null): string {
  if (profileTimeZone && isValidTimeZone(profileTimeZone)) return profileTimeZone;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
