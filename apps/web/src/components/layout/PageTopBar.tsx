"use client";

import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { Search } from "lucide-react";

// Twenty PageHeader: min-height 32px, padding 12px vertical, 16px left, 12px right
export function PageTopBar() {
  return (
    <div
      className="flex items-center justify-end shrink-0"
      style={{
        minHeight: 40,
        padding: "10px 12px 10px 16px",
      }}
    >
      <div className="flex items-center gap-1">
        <button
          className="flex items-center gap-2 px-2 py-1 rounded-md transition-colors"
          style={{ color: "var(--admin-font-tertiary, #818181)" }}
          title="Search (Cmd+K)"
        >
          <Search className="h-4 w-4" />
          <kbd
            className="hidden sm:inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: "var(--admin-bg-hover, rgba(255,255,255,0.06))",
              border: "1px solid var(--admin-border-default, #2a2a2a)",
              color: "var(--admin-font-light, #555)",
            }}
          >
            Cmd+K
          </kbd>
        </button>
        <NotificationCenter />
      </div>
    </div>
  );
}
