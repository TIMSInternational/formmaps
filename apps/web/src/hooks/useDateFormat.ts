"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, formatMonthYear, type DateLike } from "@/lib/dates";

/**
 * Locale-bound wrappers around `@/lib/dates` — formats date-only values in the
 * app's current i18n language without timezone shift.
 *
 *   const { formatDate } = useDateFormat();
 *   formatDate(app.deadline)            // "Dec 15, 2026" / "15 dic 2026"
 */
export function useDateFormat() {
  const { i18n } = useTranslation();
  // `i18n` is absent when tests stub useTranslation with only `t`.
  const locale = i18n?.language;
  return useMemo(
    () => ({
      locale,
      formatDate: (value: DateLike, opts?: Intl.DateTimeFormatOptions, fallback?: string) =>
        formatDate(value, locale, opts, fallback),
      formatMonthYear: (value: DateLike, month?: "short" | "long", fallback?: string) =>
        formatMonthYear(value, locale, month, fallback),
    }),
    [locale],
  );
}
