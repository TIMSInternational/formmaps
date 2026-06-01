"use client";

import type { LucideIcon } from "lucide-react";

export interface CounselorTab {
  key: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface CounselorTabBarProps {
  tabs: CounselorTab[];
  activeTab: string;
  onChange: (key: string) => void;
}

export function CounselorTabBar({ tabs, activeTab, onChange }: CounselorTabBarProps) {
  return (
    <div style={{
      display: "flex",
      gap: 4,
      padding: 4,
      borderRadius: 8,
      background: "var(--admin-bg-hover)",
      border: "1px solid var(--admin-border-default)",
      marginBottom: 20,
      overflowX: "auto",
    }}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)",
              background: isActive ? "var(--admin-bg-card)" : "transparent",
              border: isActive ? "1px solid var(--admin-border-default)" : "1px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "var(--admin-font-secondary)";
                e.currentTarget.style.background = "var(--admin-bg-card)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "var(--admin-font-tertiary)";
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            {Icon && <Icon style={{ width: 14, height: 14 }} />}
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 10,
                background: isActive ? "var(--admin-accent-blue, #065292)" : "var(--admin-bg-hover)",
                color: isActive ? "#fff" : "var(--admin-font-tertiary)",
              }}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
