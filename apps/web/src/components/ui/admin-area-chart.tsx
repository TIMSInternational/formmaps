"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  label: string;
  [key: string]: string | number;
}

interface SeriesConfig {
  key: string;
  name: string;
  color: string;
}

interface AdminAreaChartProps {
  title: string;
  subtitle?: string;
  data: DataPoint[];
  series: SeriesConfig[];
  height?: number;
  periodOptions?: { value: string; label: string }[];
  onPeriodChange?: (period: string) => void;
  defaultPeriod?: string;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div style={{
      background: "var(--admin-bg-card, #1e1e1e)",
      border: "1px solid var(--admin-border-default, #2a2a2a)",
      borderRadius: 6, padding: "10px 14px",
      fontSize: 12,
    }}>
      <div style={{ color: "var(--admin-font-tertiary)", marginBottom: 6, fontWeight: 500 }}>{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: entry.color }} />
          <span style={{ color: "var(--admin-font-secondary)" }}>{entry.name}:</span>
          <span style={{ color: "var(--admin-font-primary)", fontWeight: 600 }}>
            {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AdminAreaChart({
  title,
  subtitle,
  data,
  series,
  height = 260,
  periodOptions,
  onPeriodChange,
  defaultPeriod,
}: AdminAreaChartProps) {
  const [period, setPeriod] = useState(defaultPeriod || periodOptions?.[0]?.value || "");

  const handlePeriodChange = (val: string) => {
    setPeriod(val);
    onPeriodChange?.(val);
  };

  return (
    <div style={{
      borderRadius: 8,
      border: "1px solid var(--admin-border-default, #2a2a2a)",
      background: "var(--admin-bg-card, #1e1e1e)",
      padding: "20px 20px 16px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary, #ebebeb)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "var(--admin-font-tertiary, #818181)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {periodOptions && (
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            style={{
              background: "var(--admin-bg-icon-box, #2a2a2a)",
              border: "1px solid var(--admin-border-default, #2a2a2a)",
              borderRadius: 4, padding: "4px 8px",
              fontSize: 11, color: "var(--admin-font-secondary, #b3b3b3)",
              outline: "none",
            }}
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        {series.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 3, borderRadius: 1, background: s.color }} />
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary, #818181)" }}>{s.name}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`gradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--admin-border-default, #2a2a2a)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--admin-font-light, #555)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--admin-font-light, #555)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#gradient-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: "var(--admin-bg-card, #1e1e1e)" }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
