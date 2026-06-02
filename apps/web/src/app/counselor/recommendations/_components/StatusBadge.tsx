"use client";

import { Clock, CheckCircle2, Loader2, XCircle } from "lucide-react";

const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  requested: { label: "Requested", color: "#065292", bg: "#06529210", icon: Clock },
  accepted: { label: "Accepted", color: "#f59e0b", bg: "#f59e0b10", icon: CheckCircle2 },
  in_progress: { label: "In Progress", color: "#f97316", bg: "#f9731610", icon: Loader2 },
  submitted: { label: "Submitted", color: "#10b981", bg: "#10b98110", icon: CheckCircle2 },
  declined: { label: "Declined", color: "#ef4444", bg: "#ef444410", icon: XCircle },
};

export function StatusBadge({ status }: { status: string }) {
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
        whiteSpace: "nowrap",
      }}
    >
      <meta.icon style={{ width: 11, height: 11 }} />
      {meta.label}
    </span>
  );
}
