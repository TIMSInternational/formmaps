const STATUS_META: Record<string, { label: string; color: string }> = {
  requested: { label: "Requested", color: "#065292" },
  accepted: { label: "Accepted", color: "#f59e0b" },
  in_progress: { label: "In Progress", color: "#f97316" },
  submitted: { label: "Submitted", color: "#10b981" },
  declined: { label: "Declined", color: "#ef4444" },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: "#6b7280" };
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
