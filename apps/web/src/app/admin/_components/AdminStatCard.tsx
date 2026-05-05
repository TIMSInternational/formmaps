"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion } from "motion/react";

interface AdminStatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number;
  sub?: string;
}

// Animated number counter
function AnimatedValue({ value }: { value: string | number }) {
  const str = String(value);
  const numericMatch = str.match(/^([^0-9]*)([0-9,.]+)(.*)$/);

  if (!numericMatch) {
    return <span>{str}</span>;
  }

  const [prefix, numStr, suffix] = [numericMatch[1], numericMatch[2], numericMatch[3]];
  const target = parseFloat(numStr.replace(/,/g, ""));
  const hasDecimals = numStr.includes(".");
  const decimalPlaces = hasDecimals ? (numStr.split(".")[1]?.length || 0) : 0;

  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (isNaN(target)) { setDisplay(numStr); return; }

    const duration = 800;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      setDisplay(
        current.toLocaleString(undefined, {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        })
      );

      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [target, numStr, decimalPlaces]);

  return <span>{prefix}{display}{suffix}</span>;
}

// Simple 7-segment mini bar chart
function MiniBar({ trend }: { trend: number }) {
  const heights = [35, 50, 40, 55, 45, 65, trend >= 0 ? 85 : 25];
  const barColor = trend >= 0 ? "var(--admin-accent-green, #10b981)" : "var(--admin-accent-red, #ef4444)";

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 24 }}>
      {heights.map((h, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${h}%` }}
          transition={{ delay: 0.3 + i * 0.05, duration: 0.4, ease: "easeOut" }}
          style={{
            width: 3, borderRadius: 1.5,
            background: i === heights.length - 1 ? barColor : "var(--admin-border-default, #2a2a2a)",
          }}
        />
      ))}
    </div>
  );
}

export function AdminStatCard({ label, value, icon: Icon, trend, sub }: AdminStatCardProps) {
  const isPositive = trend !== undefined && trend >= 0;
  const trendColor = trend !== undefined
    ? isPositive ? "var(--admin-accent-green, #10b981)" : "var(--admin-accent-red, #ef4444)"
    : undefined;

  const TrendIcon = trend !== undefined
    ? trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{
        borderRadius: 8,
        border: "1px solid var(--admin-border-default, #2a2a2a)",
        background: "var(--admin-bg-card, #1e1e1e)",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Top — label + icon */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-tertiary, #818181)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </span>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "var(--admin-bg-icon-box, #2a2a2a)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon style={{ width: 15, height: 15, color: "var(--admin-font-tertiary, #818181)" }} />
        </div>
      </div>

      {/* Value + mini bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: "var(--admin-font-primary, #ebebeb)", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {value === "—" ? <span>—</span> : <AnimatedValue value={value} />}
        </div>
        {trend !== undefined && <MiniBar trend={trend} />}
      </div>

      {/* Trend badge + sub */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {sub && (
          <span style={{ fontSize: 11, color: "var(--admin-font-light, #555)" }}>
            {sub}
          </span>
        )}
        {trend !== undefined && TrendIcon && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 11, fontWeight: 600, color: trendColor,
            background: isPositive ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            padding: "3px 8px", borderRadius: 4,
            marginLeft: "auto",
          }}>
            <TrendIcon style={{ width: 11, height: 11 }} />
            {isPositive ? "+" : ""}{Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
    </motion.div>
  );
}
