"use client";

import { useState, useCallback } from "react";
import { Pencil, Loader2 } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface InlineEditSelectProps {
  value: string;
  options: Option[];
  onSave: (value: string) => Promise<void> | void;
  label?: string;
  placeholder?: string;
}

export function InlineEditSelect({
  value,
  options,
  onSave,
  label,
  placeholder,
}: InlineEditSelectProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const displayLabel = options.find((o) => o.value === value)?.label ?? value;

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newVal = e.target.value;
      if (newVal === value) {
        setEditing(false);
        return;
      }
      setSaving(true);
      try {
        await onSave(newVal);
      } finally {
        setSaving(false);
        setEditing(false);
      }
    },
    [value, onSave],
  );

  if (!editing) {
    return (
      <div className="group flex items-center gap-2">
        <div className="flex-1 min-w-0">
          {label && (
            <div
              className="text-[11px] font-medium uppercase tracking-wider mb-0.5"
              style={{ color: "var(--admin-font-tertiary, var(--muted-foreground))" }}
            >
              {label}
            </div>
          )}
          <div
            className="text-sm cursor-pointer rounded px-1 -mx-1 py-0.5 transition-colors"
            style={{ color: "var(--admin-font-primary, var(--foreground))" }}
            onClick={() => setEditing(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
          >
            {displayLabel || (
              <span style={{ color: "var(--admin-font-light)" }}>
                {placeholder ?? "Select..."}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
          style={{ color: "var(--admin-font-tertiary)" }}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <div
          className="text-[11px] font-medium uppercase tracking-wider mb-1"
          style={{ color: "var(--admin-font-tertiary)" }}
        >
          {label}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <select
          value={value}
          onChange={handleChange}
          onBlur={() => setEditing(false)}
          autoFocus
          disabled={saving}
          style={{
            background: "var(--admin-bg-input, var(--input))",
            border: "1px solid var(--admin-border-hover, var(--border))",
            color: "var(--admin-font-primary, var(--foreground))",
            borderRadius: "4px",
            fontSize: "13px",
            padding: "4px 8px",
            width: "100%",
            outline: "none",
            height: "32px",
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {saving && (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: "var(--admin-font-tertiary)" }} />
        )}
      </div>
    </div>
  );
}
