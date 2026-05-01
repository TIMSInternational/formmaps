"use client";

import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumb?: string;
}

export function AdminPageHeader({ title, subtitle, actions, breadcrumb }: AdminPageHeaderProps) {
  return (
    <div
      className="flex items-center justify-between pb-4"
      style={{ borderBottom: "1px solid var(--admin-border-default, #2a2a2a)" }}
    >
      <div>
        {breadcrumb && (
          <div style={{ fontSize: 11, color: "var(--admin-font-light, #555)", marginBottom: 2 }}>{breadcrumb}</div>
        )}
        <h1
          className="text-[20px] font-semibold tracking-tight leading-tight"
          style={{ color: "var(--admin-font-primary, #ebebeb)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-sectionLabel, #666)" }}>{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
