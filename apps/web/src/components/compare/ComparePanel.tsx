"use client";

import {
  MapPin,
  DollarSign,
  Users,
  Award,
  GraduationCap,
  Building2,
  Star,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { University, MatchBreakdown } from "@/types/university";

interface CompareItem {
  university: University;
  matchScore?: number;
  matchBreakdown?: MatchBreakdown;
}

interface ComparePanelProps {
  items: CompareItem[];
}

interface CompareRow {
  label: string;
  icon: React.ElementType;
  values: (string | number | null)[];
  highlight?: "highest" | "lowest";
  format?: "number" | "currency" | "percent" | "text";
}

export function ComparePanel({ items }: ComparePanelProps) {
  if (items.length < 2) return null;

  const rows: CompareRow[] = [
    {
      label: "Match Score",
      icon: TrendingUp,
      values: items.map((i) => i.matchScore ?? null),
      highlight: "highest",
      format: "percent",
    },
    {
      label: "Global Rank",
      icon: Award,
      values: items.map((i) => i.university.ranking?.global ?? null),
      highlight: "lowest",
    },
    {
      label: "Acceptance Rate",
      icon: Users,
      values: items.map((i) => i.university.acceptanceRate ?? null),
      format: "percent",
    },
    {
      label: "Tuition / Year",
      icon: DollarSign,
      values: items.map((i) =>
        i.university.tuition?.international ??
        i.university.tuition?.outOfState ??
        i.university.tuition?.inState ??
        null,
      ),
      highlight: "lowest",
      format: "currency",
    },
    {
      label: "Type",
      icon: Building2,
      values: items.map((i) => i.university.type),
      format: "text",
    },
    {
      label: "Setting",
      icon: MapPin,
      values: items.map((i) => i.university.setting ?? null),
      format: "text",
    },
    {
      label: "Programs",
      icon: GraduationCap,
      values: items.map((i) => i.university.programs?.length ?? null),
      highlight: "highest",
    },
    {
      label: "Graduation Rate",
      icon: Star,
      values: items.map((i) => i.university.graduationRate ?? null),
      highlight: "highest",
      format: "percent",
    },
  ];

  function findBestIdx(values: (string | number | null)[], mode: "highest" | "lowest"): number {
    let bestIdx = -1;
    let bestVal = mode === "highest" ? -Infinity : Infinity;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (typeof v !== "number") continue;
      if (mode === "highest" && v > bestVal) { bestVal = v; bestIdx = i; }
      if (mode === "lowest" && v < bestVal) { bestVal = v; bestIdx = i; }
    }
    return bestIdx;
  }

  function formatValue(v: string | number | null, fmt?: string): string {
    if (v === null || v === undefined) return "--";
    if (fmt === "currency" && typeof v === "number") return `$${(v / 1000).toFixed(0)}k`;
    if (fmt === "percent" && typeof v === "number") return `${v.toFixed(0)}%`;
    if (fmt === "text" && typeof v === "string") return v.charAt(0).toUpperCase() + v.slice(1);
    if (typeof v === "number") return `#${v}`;
    return String(v);
  }

  return (
    <div className="space-y-4">
      {/* University headers */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((item) => (
          <div
            key={item.university.id}
            className="p-3 rounded-lg text-center"
            style={{
              background: "var(--admin-bg-hover)",
              border: "1px solid var(--admin-border-light)",
            }}
          >
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold mx-auto mb-2"
              style={{
                background: "var(--admin-bg-icon-box)",
                color: "var(--admin-font-secondary)",
                border: "1px solid var(--admin-border-light)",
              }}
            >
              {item.university.shortName?.slice(0, 2) || item.university.name.charAt(0)}
            </div>
            <div
              className="text-xs font-semibold line-clamp-2"
              style={{ color: "var(--admin-font-primary)" }}
            >
              {item.university.name}
            </div>
            <div
              className="flex items-center justify-center gap-1 text-[10px] mt-1"
              style={{ color: "var(--admin-font-tertiary)" }}
            >
              <MapPin className="h-2.5 w-2.5" />
              {item.university.city}, {item.university.country}
            </div>
          </div>
        ))}
      </div>

      {/* Comparison rows */}
      <div className="space-y-1">
        {rows.map((row) => {
          const bestIdx = row.highlight ? findBestIdx(row.values, row.highlight) : -1;
          return (
            <div
              key={row.label}
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--admin-border-light)" }}
            >
              {/* Row label */}
              <div
                className="flex items-center gap-1.5 px-3 py-1.5"
                style={{ background: "var(--admin-bg-hover)" }}
              >
                <row.icon className="h-3 w-3" style={{ color: "var(--admin-font-tertiary)" }} />
                <span
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--admin-font-tertiary)" }}
                >
                  {row.label}
                </span>
              </div>
              {/* Values */}
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
              >
                {row.values.map((val, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-center py-2.5 text-sm font-bold"
                    style={{
                      color:
                        idx === bestIdx
                          ? "var(--admin-accent-green, #10b981)"
                          : "var(--admin-font-primary)",
                      background:
                        idx === bestIdx
                          ? "var(--admin-accent-bg-green, rgba(16,185,129,0.1))"
                          : "transparent",
                      borderLeft: idx > 0 ? "1px solid var(--admin-border-light)" : "none",
                    }}
                  >
                    {formatValue(val, row.format)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
