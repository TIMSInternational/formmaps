"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import { getCoachAvailableSlots } from "@/services/coachService";
import { parseYmdLocal } from "@/lib/dateUtils";

interface AvailabilityStatusProps {
  coachId: string;
}

/**
 * Coach-profile sidebar availability status.
 *
 * Task 7 client report (Madhav): this block used to render hardcoded
 * "Next Available" / "Slots available today" copy unconditionally — zero
 * data binding — directly contradicting the real booking calendar (same
 * `getCoachSlots` endpoint) whenever the coach had nothing open today.
 *
 * This fetches TODAY's real slots via the same endpoint the booking modal
 * already uses (getCoachAvailableSlots -> GET /:coachId/slots) and only ever
 * shows availability copy that endpoint actually backs:
 *   - slots.length > 0            -> "Slots available today" (now true)
 *   - slots.length === 0 + a real nextAvailableDate (server forward-scan)
 *                                  -> that real date
 *   - slots.length === 0, no next -> neutral "check calendar" fallback
 */
export function AvailabilityStatus({ coachId }: AvailabilityStatusProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasSlotsToday, setHasSlotsToday] = useState(false);
  const [nextAvailableDate, setNextAvailableDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTodayAvailability() {
      setIsLoading(true);
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const data = await getCoachAvailableSlots(coachId, today);
        if (cancelled) return;
        setHasSlotsToday((data?.slots?.length ?? 0) > 0);
        setNextAvailableDate(data?.nextAvailableDate ?? null);
      } catch {
        if (!cancelled) {
          setHasSlotsToday(false);
          setNextAvailableDate(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadTodayAvailability();
    return () => {
      cancelled = true;
    };
  }, [coachId]);

  let subtext: string;
  if (isLoading) {
    subtext = t("booking.checkingAvailability");
  } else if (hasSlotsToday) {
    subtext = t("coaching.profile.slotsToday");
  } else if (nextAvailableDate) {
    subtext = t("coaching.profile.nextAvailableOn", {
      date: format(parseYmdLocal(nextAvailableDate), "MMM d"),
    });
  } else {
    subtext = t("coaching.profile.checkCalendarFallback");
  }

  return (
    <div className="rounded-xl bg-secondary p-3 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center border border-border">
          <Clock className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">{t("coaching.profile.nextAvailable")}</p>
          <p className="text-[11px] text-muted-foreground">{subtext}</p>
        </div>
      </div>
    </div>
  );
}
