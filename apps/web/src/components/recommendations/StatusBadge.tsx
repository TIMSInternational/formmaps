"use client";

import { useTranslation } from "react-i18next";

// labelKey is an i18n key (common namespace); the status value itself is API data.
const STATUS_META: Record<string, { labelKey: string; color: string }> = {
  requested: { labelKey: "components.recommendationStatus.requested", color: "var(--admin-accent-blue)" },
  accepted: { labelKey: "components.recommendationStatus.accepted", color: "#f59e0b" },
  in_progress: { labelKey: "components.recommendationStatus.inProgress", color: "#f97316" },
  submitted: { labelKey: "components.recommendationStatus.submitted", color: "#10b981" },
  declined: { labelKey: "components.recommendationStatus.declined", color: "#ef4444" },
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const known = STATUS_META[status];
  const meta = known
    ? { label: t(known.labelKey), color: known.color }
    : { label: status, color: "#6b7280" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: meta.color,
        background: `${meta.color}15`,
      }}
    >
      {meta.label}
    </span>
  );
}

export default StatusBadge;
