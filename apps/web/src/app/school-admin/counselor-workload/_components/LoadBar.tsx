"use client";

import { motion } from "motion/react";

export function LoadBar({ current, max }: { current: number; max: number }) {
  const pct = Math.min((current / max) * 100, 100);
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 4, background: color }}
        />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", minWidth: 50, textAlign: "right" }}>
        {current}/{max}
      </span>
    </div>
  );
}
