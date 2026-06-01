"use client";

import { X } from "lucide-react";

export interface FilterPill {
  key: string;
  label: string;
  value: string;
}

interface ActiveFilterPillsProps {
  pills: FilterPill[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export function ActiveFilterPills({ pills, onRemove, onClearAll }: ActiveFilterPillsProps) {
  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((pill) => (
        <button
          key={pill.key}
          onClick={() => onRemove(pill.key)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
          style={{
            background: "var(--admin-accent-bg-blue, rgba(59,130,246,0.1))",
            color: "var(--admin-accent-blue, #065292)",
            border: "1px solid var(--admin-accent-border-blue, rgba(59,130,246,0.15))",
          }}
        >
          <span className="opacity-70">{pill.label}:</span>
          <span>{pill.value}</span>
          <X className="h-2.5 w-2.5 ml-0.5 opacity-60 hover:opacity-100" />
        </button>
      ))}
      <button
        onClick={onClearAll}
        className="text-[11px] font-medium px-1.5 py-1 rounded transition-colors"
        style={{ color: "var(--admin-font-tertiary, #818181)" }}
      >
        Clear all
      </button>
    </div>
  );
}
