/**
 * Shared date/time formatting utilities.
 * Canonical source — import from here, not from individual page files.
 */

export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Format an elapsed-time value defensively for display.
 * - number → treated as SECONDS, rendered as `m:ss` (or `h:mm:ss` if ≥ 1h)
 * - string → returned with a leading `00:`/`0` trimmed (matches prior display)
 * - falsy / unparseable → "--:--"
 *
 * Backend stores `totalTimeSpent` as `Int?` (seconds) but various API/hook
 * paths surface it as either a number or a "HH:MM:SS" string — this handles both
 * so callers never crash on `.replace` of a number.
 */
export function formatSeconds(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "--:--";

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return "--:--";
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const ss = String(seconds).padStart(2, "0");
    if (hours > 0) {
      const mm = String(minutes).padStart(2, "0");
      return `${hours}:${mm}:${ss}`;
    }
    return `${minutes}:${ss}`;
  }

  // string: keep prior trimming behavior ("00:04:32" → "4:32")
  return value.replace(/^00:/, "").replace(/^0/, "");
}

export function formatDuration(start: string, end?: string): string {
  if (!end) return "Ongoing";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function formatScheduledTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  if (diffMins < 0) return `${dateStr} at ${timeStr} (overdue)`;
  if (diffMins < 60) return `In ${diffMins}m - ${timeStr}`;
  if (diffHours < 24) return `In ${diffHours}h - Today at ${timeStr}`;
  if (diffDays === 1) return `Tomorrow at ${timeStr}`;
  return `${dateStr} at ${timeStr}`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Conversation-style relative time (Today time, Yesterday, weekday, short date). */
export function formatMessageTime(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Simple time-of-day formatting (e.g. "2:30 PM"). */
export function formatTimeOfDay(dateString: string): string {
  try {
    return new Date(dateString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

/**
 * YYYY-MM-DD using the LOCAL calendar date. Use this (never
 * `toISOString().split("T")[0]`) when sending a user-selected day to the API:
 * after ~7-8 PM in US timezones the UTC date is already tomorrow, so the UTC
 * form silently requests the wrong day.
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Format a DATE-ONLY value (stored as UTC midnight, e.g. test-score dates,
 * recommendation due dates) using its UTC parts. Local formatting shifts these
 * a day back in any western timezone ("entered 2026-05-01, displayed Apr 30").
 */
export function formatDateOnly(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
