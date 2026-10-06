/**
 * Course duration label ("6 weeks"), or null when the source has no duration
 * (0/null) — callers hide the chip instead of rendering "0 weeks" or a bare 0 (#397).
 */
export function formatCourseDuration(
  duration: number | null | undefined,
  t: (key: string) => string,
): string | null {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return null;
  return `${duration} ${duration === 1 ? t("courses.week") : t("courses.weeks")}`;
}
