"use client";

import {
  Bell,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface AlertSummary {
  total?: number;
  byPriority?: { critical?: number; high?: number };
  newSinceLastLogin?: number;
}

interface AlertsSummaryStatsProps {
  summary: AlertSummary;
}

export function AlertsSummaryStats({ summary }: AlertsSummaryStatsProps) {
  const stats = [
    { label: "Total Alerts", value: summary.total ?? 0, icon: Bell, color: "#6b7280" },
    { label: "Critical Priority", value: summary.byPriority?.critical ?? 0, icon: AlertTriangle, color: "#ef4444" },
    { label: "High Priority", value: summary.byPriority?.high ?? 0, icon: AlertCircle, color: "#f59e0b" },
    { label: "New Since Login", value: summary.newSinceLastLogin ?? 0, icon: CheckCircle2, color: "#8b5cf6" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} style={{
          borderRadius: 8, border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)", padding: "16px",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${stat.color}15`,
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10,
          }}>
            <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" }}>
            {stat.value}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}
