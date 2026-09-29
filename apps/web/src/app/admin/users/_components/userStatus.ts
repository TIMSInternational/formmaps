/**
 * What the admin Users screen should say about an account's state.
 *
 * `status` (isActive) cannot tell an onboarded person from one who never opened their
 * invitation: an invited account is active from the moment it is invited. The API's
 * `inviteStatus` separates them; a backend that predates it simply omits it, and this falls
 * back to the old active/inactive reading.
 */
export type DisplayStatus = "active" | "inactive" | "invited" | "expired";

export function displayStatus(user: { status: string; inviteStatus?: string | null }): DisplayStatus {
  if (user.status === "inactive") return "inactive";
  if (user.inviteStatus === "invited") return "invited";
  if (user.inviteStatus === "expired") return "expired";
  return "active";
}

/** Whole days left before `iso` (0 = less than a day), or null when there is no usable date. */
export function daysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** "+5.0%", "−3.2%", "0.0%" — the sign belongs to the number, so a decline never reads "+-5%". */
export function formatSignedPercent(value: number | null | undefined, digits = 1): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.0%";
  const fixed = Math.abs(n).toFixed(digits);
  if (Number(fixed) === 0) return `${(0).toFixed(digits)}%`;
  return `${n > 0 ? "+" : "−"}${fixed}%`;
}
