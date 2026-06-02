"use client";

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";

export function StatCard({ label, value, color, icon: Icon, delay }: {
  label: string; value: number; color: string; icon: LucideIcon; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      style={{
        background: "var(--admin-bg-card, #fff)",
        border: "1px solid var(--admin-border-default, rgba(0,0,0,0.08))",
        borderRadius: 12,
        padding: "16px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${color}15`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon style={{ width: 15, height: 15, color }} strokeWidth={1.8} />
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
          color: "var(--admin-font-tertiary, #888)",
        }}>{label}</span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary, #111)", letterSpacing: "-0.02em" }}>{value}</p>
    </motion.div>
  );
}
