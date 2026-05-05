"use client";

import { School, UserPlus, Users, GraduationCap } from "lucide-react";
import { useAdminAnalyticsSummary } from "@/hooks/useAdminAnalytics";

interface StatRow {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}

export function QuickStatsCard() {
  const { data: analytics } = useAdminAnalyticsSummary("month");
  const stats = analytics?.stats;

  const rows: StatRow[] = [
    {
      label: "Active Schools",
      value: (stats as any)?.activeSchools?.toLocaleString() || "—",
      icon: School,
      color: "#3b82f6",
    },
    {
      label: "Total Coaches",
      value: (stats as any)?.activeCoaches?.toLocaleString() || "—",
      icon: GraduationCap,
      color: "#8b5cf6",
    },
    {
      label: "Pending Invites",
      value: (stats as any)?.pendingInvites?.toLocaleString() || "—",
      icon: UserPlus,
      color: "#f59e0b",
    },
    {
      label: "Total Students",
      value: stats?.totalUsers?.toLocaleString() || "—",
      icon: Users,
      color: "#10b981",
    },
  ];

  return (
    <div
      style={{
        borderRadius: "var(--admin-radius-lg, 8px)",
        border: "1px solid var(--admin-border-default, #2a2a2a)",
        background: "var(--admin-bg-card, #1e1e1e)",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6" }} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--admin-font-tertiary, #818181)",
          }}
        >
          Quick Stats
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, justifyContent: "space-between" }}>
        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--admin-bg-hover, #252525)",
              transition: "background 0.15s",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: `${row.color}15`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <row.icon style={{ width: 16, height: 16, color: row.color }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--admin-font-tertiary, #818181)",
                  fontWeight: 500,
                }}
              >
                {row.label}
              </div>
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--admin-font-primary, #ebebeb)",
                letterSpacing: "-0.02em",
              }}
            >
              {row.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
