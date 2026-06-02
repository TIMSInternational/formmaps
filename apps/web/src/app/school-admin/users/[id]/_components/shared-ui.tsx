"use client";

import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";

export function PCAChartImage({ pcaCod }: { pcaCod?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!pcaCod) return;
    let revoked = false;
    (async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/pcaapi/img-report?pcaCod=${pcaCod}`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (!revoked) setSrc(url);
      } catch { /* ignore */ }
    })();
    return () => { revoked = true; };
  }, [pcaCod]);
  if (!src) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <img src={src} alt="DISC Chart" style={{ width: "100%", borderRadius: 6, border: "1px solid var(--admin-border-default)" }} />
    </div>
  );
}

export function CardHeader({ icon: Icon, color, title, badge }: { icon: LucideIcon; color: string; title: string; badge?: React.ReactNode }) {
  return (
    <div style={{
      padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
      display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)",
    }}>
      <Icon style={{ width: 14, height: 14, color }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{title}</span>
      {badge}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      borderRadius: 8, border: "1px solid var(--admin-border-default)",
      background: "var(--admin-bg-card)", overflow: "hidden",
    }}>
      {children}
    </div>
  );
}
