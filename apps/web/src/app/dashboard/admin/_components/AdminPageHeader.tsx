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
    <div className="flex items-center justify-between pb-4 border-b border-[#e4e4e7] dark:border-[#2a2a2a]">
      <div>
        {breadcrumb && (
          <div className="text-[11px] text-[#8a8a8e] mb-0.5">{breadcrumb}</div>
        )}
        <h1 className="text-[20px] font-semibold text-[#141414] dark:text-white tracking-tight leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-[13px] text-[#8a8a8e] mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
