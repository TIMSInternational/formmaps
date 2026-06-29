"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";

interface ExtendDeadlinePickerProps {
  currentExpiry: string | null;
  isLoading: boolean;
  onExtend: (days: number) => void;
  onClose: () => void;
}

export function ExtendDeadlinePicker({ currentExpiry, isLoading, onExtend, onClose }: ExtendDeadlinePickerProps) {
  const { t } = useTranslation("counselor");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const presets = [
    { label: t("extendDeadline.preset1Day", "1 day"), days: 1 },
    { label: t("extendDeadline.preset3Days", "3 days"), days: 3 },
    { label: t("extendDeadline.preset1Week", "1 week"), days: 7 },
    { label: t("extendDeadline.preset2Weeks", "2 weeks"), days: 14 },
  ];

  const currentDate = currentExpiry ? new Date(currentExpiry) : new Date();
  const isExpired = currentDate < new Date();

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    const diffDays = Math.max(1, Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    onExtend(diffDays);
  };

  return (
    <div style={{
      marginTop: 8, borderRadius: 8,
      background: "var(--admin-bg-card)", border: "1px solid rgba(59,130,246,0.2)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 12px", background: "rgba(59,130,246,0.04)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(59,130,246,0.1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CalendarDays style={{ width: 13, height: 13, color: "#065292" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("extendDeadline.title", "Extend Deadline")}</span>
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 3,
            background: isExpired ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)",
            color: isExpired ? "#ef4444" : "#065292", fontWeight: 600,
          }}>
            {isExpired ? t("extendDeadline.expired", "EXPIRED") : t("extendDeadline.due", { date: currentDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) })}
          </span>
        </div>
        <button onClick={onClose} style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />
        </button>
      </div>

      <div style={{ padding: "8px 12px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", fontWeight: 600 }}>{t("extendDeadline.quick", "Quick:")}</span>
        {presets.map((p) => (
          <button key={p.days} disabled={isLoading}
            onClick={() => onExtend(p.days)}
            style={{
              height: 26, borderRadius: 5, padding: "0 10px", fontSize: 11, fontWeight: 600,
              background: "var(--admin-bg-hover)", color: "#065292",
              border: "1px solid var(--admin-border-default)", cursor: "pointer",
              opacity: isLoading ? 0.5 : 1,
            }}>
            {isLoading ? "..." : p.label}
          </button>
        ))}
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          style={{
            height: 26, borderRadius: 5, padding: "0 10px", fontSize: 11, fontWeight: 600,
            background: showCalendar ? "#065292" : "var(--admin-bg-hover)",
            color: showCalendar ? "#fff" : "var(--admin-font-primary)",
            border: "1px solid var(--admin-border-default)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}>
          <CalendarDays style={{ width: 11, height: 11 }} />
          {t("extendDeadline.pickDate", "Pick date")}
        </button>
      </div>

      {showCalendar && (
        <div style={{ padding: "0 12px 12px", display: "flex", justifyContent: "center" }}>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            disabled={{ before: new Date() }}
            defaultMonth={currentDate > new Date() ? currentDate : new Date()}
            className="rounded-md border"
          />
        </div>
      )}
    </div>
  );
}
