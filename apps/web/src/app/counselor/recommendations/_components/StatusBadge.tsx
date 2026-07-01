"use client";

import { useTranslation } from "react-i18next";
import { Clock, CheckCircle2, Loader2, XCircle } from "lucide-react";

type StatusMeta = { color: string; bg: string; icon: React.ElementType };

const STATUS_META: Record<string, StatusMeta> = {
  requested:   { color: "#2E9098", bg: "#2E909810", icon: Clock },
  accepted:    { color: "#f59e0b", bg: "#f59e0b10", icon: CheckCircle2 },
  in_progress: { color: "#f97316", bg: "#f9731610", icon: Loader2 },
  submitted:   { color: "#10b981", bg: "#10b98110", icon: CheckCircle2 },
  declined:    { color: "#ef4444", bg: "#ef444410", icon: XCircle },
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("counselor");

  const statusLabels: Record<string, string> = {
    requested:   t("recommendations.statusRequested", "Requested"),
    accepted:    t("recommendations.statusAccepted", "Accepted"),
    in_progress: t("recommendations.statusInProgress", "In Progress"),
    submitted:   t("recommendations.statusSubmitted", "Submitted"),
    declined:    t("recommendations.statusDeclined", "Declined"),
  };

  const meta = STATUS_META[status] ?? {
    color: "var(--admin-font-tertiary)",
    bg: "var(--admin-bg-hover)",
    icon: Clock,
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: meta.bg,
        color: meta.color,
        whiteSpace: "nowrap",
      }}
    >
      <meta.icon style={{ width: 11, height: 11 }} />
      {statusLabels[status] ?? status}
    </span>
  );
}
