"use client";

import { useState } from "react";
import { Trash2, Pencil, ChevronDown, ChevronUp } from "lucide-react";

interface Activity {
  id: string;
  name: string;
  category: string;
  organization?: string;
  role?: string;
  startDate: string;
  endDate?: string;
  hoursPerWeek?: number;
  weeksPerYear?: number;
  description?: string;
  awards?: string;
}

const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  academic: { color: "#065292", bg: "rgba(59,130,246,0.1)" },
  athletic: { color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  arts: { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  community_service: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  work: { color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  leadership: { color: "#065292", bg: "rgba(99,102,241,0.1)" },
};

const CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic",
  athletic: "Athletic",
  arts: "Arts",
  community_service: "Community Service",
  work: "Work",
  leadership: "Leadership",
};

function formatDateRange(start: string, end?: string): string {
  const s = new Date(start).toLocaleDateString();
  if (!end) return `${s} - Present`;
  return `${s} - ${new Date(end).toLocaleDateString()}`;
}

interface ActivityCardProps {
  activity: Activity;
  onEdit: (activity: Activity) => void;
  onDelete: (id: string) => void;
}

export function ActivityCard({ activity: a, onEdit, onDelete }: ActivityCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const catColor = CATEGORY_COLORS[a.category] || CATEGORY_COLORS.academic;
  const catLabel = CATEGORY_LABELS[a.category] || a.category;

  return (
    <div style={{
      padding: 16, borderRadius: 10,
      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
              background: catColor.bg, color: catColor.color, textTransform: "uppercase",
            }}>
              {catLabel}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{a.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--admin-font-tertiary)" }}>
            {a.organization && <span>{a.organization}</span>}
            {a.role && <span>{a.role}</span>}
            <span>{formatDateRange(a.startDate, a.endDate)}</span>
          </div>
          {(a.hoursPerWeek || a.weeksPerYear) && (
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
              {a.hoursPerWeek ? `${a.hoursPerWeek} hrs/week` : ""}
              {a.hoursPerWeek && a.weeksPerYear ? ", " : ""}
              {a.weeksPerYear ? `${a.weeksPerYear} weeks/year` : ""}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {a.description && (
            <button onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? "Collapse" : "Expand"}
              style={{
                width: 28, height: 28, borderRadius: 4,
                border: "1px solid var(--admin-border-default)", background: "transparent",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              {isExpanded
                ? <ChevronUp style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />
                : <ChevronDown style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />}
            </button>
          )}
          <button onClick={() => onEdit(a)} title="Edit"
            style={{
              width: 28, height: 28, borderRadius: 4,
              border: "1px solid var(--admin-border-default)", background: "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <Pencil style={{ width: 12, height: 12, color: "#065292" }} />
          </button>
          <button onClick={() => onDelete(a.id)} title="Delete"
            style={{
              width: 28, height: 28, borderRadius: 4,
              border: "1px solid var(--admin-border-default)", background: "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--admin-border-light)" }}>
          {a.description && (
            <p style={{ fontSize: 12, color: "var(--admin-font-secondary)", lineHeight: 1.5, marginBottom: a.awards ? 8 : 0 }}>
              {a.description}
            </p>
          )}
          {a.awards && (
            <div style={{
              fontSize: 12, color: "#f59e0b", padding: "6px 10px", borderRadius: 6,
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)",
            }}>
              <span style={{ fontWeight: 600 }}>Awards:</span> {a.awards}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
