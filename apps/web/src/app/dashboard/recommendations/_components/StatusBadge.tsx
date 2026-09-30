"use client";

import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

const STATUS_META: Record<
  string,
  // label = i18n key
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  requested: {
    label: "counselor:recommendations.statusRequested",
    color: "var(--admin-accent-blue)",
    bg: "var(--admin-accent-blue)10",
    icon: Clock,
  },
  accepted: {
    label: "counselor:recommendations.statusAccepted",
    color: "#f59e0b",
    bg: "#f59e0b10",
    icon: CheckCircle2,
  },
  in_progress: {
    label: "counselor:recommendations.statusInProgress",
    color: "#f97316",
    bg: "#f9731610",
    icon: Loader2,
  },
  submitted: {
    label: "counselor:recommendations.statusSubmitted",
    color: "#10b981",
    bg: "#10b98110",
    icon: CheckCircle2,
  },
  declined: {
    label: "counselor:recommendations.statusDeclined",
    color: "#ef4444",
    bg: "#ef444410",
    icon: XCircle,
  },
};

export default function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const meta = STATUS_META[status] ?? {
    label: status,
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
      }}
    >
      <meta.icon style={{ width: 11, height: 11 }} />
      {t(meta.label, { defaultValue: status })}
    </span>
  );
}
