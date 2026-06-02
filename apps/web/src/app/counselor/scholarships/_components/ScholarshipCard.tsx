"use client";

import { Trash2, ExternalLink } from "lucide-react";

interface Scholarship {
  id: string;
  name: string;
  provider: string;
  amount: number;
  deadline?: string;
  url?: string;
  notes?: string;
  status: "researching" | "applying" | "submitted" | "awarded" | "rejected";
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  researching: { label: "Researching", color: "#065292", bg: "rgba(59,130,246,0.1)" },
  applying: { label: "Applying", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  submitted: { label: "Submitted", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  awarded: { label: "Awarded", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  rejected: { label: "Rejected", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
};

const STATUS_OPTIONS = ["researching", "applying", "submitted", "awarded", "rejected"];

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

interface ScholarshipCardProps {
  scholarship: Scholarship;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}

export function ScholarshipCard({ scholarship: s, onStatusChange, onDelete }: ScholarshipCardProps) {
  const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.researching;

  return (
    <div style={{
      padding: 16, borderRadius: 10,
      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.name}</div>
          {s.provider && (
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{s.provider}</div>
          )}
        </div>
        <span style={{
          fontSize: 13, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
          background: "rgba(59,130,246,0.1)", color: "#065292", whiteSpace: "nowrap",
        }}>
          {formatCurrency(s.amount || 0)}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {s.deadline && (
          <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
            Deadline: {new Date(s.deadline).toLocaleDateString()}
          </span>
        )}
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
          background: cfg.bg, color: cfg.color,
        }}>
          {cfg.label}
        </span>
      </div>

      {s.notes && (
        <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 10, lineHeight: 1.4 }}>
          {s.notes}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid var(--admin-border-light)", paddingTop: 10 }}>
        <select
          value={s.status}
          onChange={(e) => onStatusChange(s.id, e.target.value)}
          style={{
            height: 28, borderRadius: 4, padding: "0 6px", fontSize: 11,
            border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
            color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit", cursor: "pointer",
          }}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{STATUS_CONFIG[opt].label}</option>
          ))}
        </select>
        {s.url && (
          <a href={s.url} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#065292", textDecoration: "none" }}>
            <ExternalLink style={{ width: 12, height: 12 }} /> Link
          </a>
        )}
        <button onClick={() => onDelete(s.id)} title="Delete scholarship"
          style={{
            marginLeft: "auto", width: 28, height: 28, borderRadius: 4,
            border: "1px solid var(--admin-border-default)", background: "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
        </button>
      </div>
    </div>
  );
}
