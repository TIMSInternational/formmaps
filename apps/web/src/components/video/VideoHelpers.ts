/**
 * Shared utility functions for video session pages.
 * Used by counselor, school-admin, and dashboard video pages.
 *
 * Re-exports canonical implementations from lib/ for backward compatibility.
 */

export { formatTime, formatDuration, formatScheduledTime } from "@/lib/dateUtils";
export { getInitials } from "@/lib/stringUtils";

export function getMinDatetime(): string {
  const d = new Date(Date.now() + 5 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toISOString().slice(0, 16);
}
