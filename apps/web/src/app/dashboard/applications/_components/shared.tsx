"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Values render verbatim — user-entered proper names ("Universidad de Costa
 * Rica") must never be title-cased (#409). `capitalize` is opt-in for
 * lower-case enum values only.
 */
export function InfoRow({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--admin-font-tertiary)" }}>
        {label}
      </span>
      <span className={cn("text-sm font-medium", capitalize && "capitalize")} style={{ color: "var(--admin-font-primary)" }}>
        {value}
      </span>
    </div>
  );
}

export function FormInput({
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg text-xs outline-none"
      style={{
        background: "var(--admin-bg-input)",
        border: "1px solid var(--admin-border-default)",
        color: "var(--admin-font-primary)",
      }}
    />
  );
}

export function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 gap-3 rounded-xl"
      style={{ border: "1px dashed var(--admin-border-default)" }}
    >
      <div style={{ color: "var(--admin-font-light)" }}>{icon}</div>
      <p className="text-xs text-center max-w-xs" style={{ color: "var(--admin-font-tertiary)" }}>
        {message}
      </p>
    </div>
  );
}
