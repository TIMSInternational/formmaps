"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface AdminStatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number;
  sub?: string;
}

export function AdminStatCard({ label, value, icon: Icon, trend, sub }: AdminStatCardProps) {
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid #2a2a2a",
        background: "#1e1e1e",
        padding: 16,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#333"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 6,
          background: "#2a2a2a",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon style={{ width: 16, height: 16, color: "#818181" }} />
        </div>
        {trend !== undefined && (
          <div style={{
            display: "flex", alignItems: "center", gap: 2,
            fontSize: 11, fontWeight: 500,
            color: trend >= 0 ? "#10b981" : "#ef4444",
          }}>
            {trend >= 0
              ? <TrendingUp style={{ width: 12, height: 12 }} />
              : <TrendingDown style={{ width: 12, height: 12 }} />}
            {trend >= 0 ? "+" : ""}{Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: "#ebebeb", letterSpacing: "-0.02em" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#818181", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
