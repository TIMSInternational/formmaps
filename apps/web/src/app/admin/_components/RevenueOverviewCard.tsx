"use client";

import { motion, useReducedMotion } from "motion/react";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { LiveFeed, type FeedItem } from "@/components/ui/live-feed";

function generateArcDots(count: number, radius: number, cx: number, cy: number) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.PI - (i / (count - 1)) * Math.PI;
    dots.push({
      x: Math.round((cx + radius * Math.cos(angle)) * 100) / 100,
      y: Math.round((cy - radius * Math.sin(angle)) * 100) / 100,
    });
  }
  return dots;
}

function formatTimeAgo(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function mapActivityToFeed(activities: any[]): FeedItem[] {
  return activities.map((a, i) => ({
    id: `activity-${i}`,
    type: a.type || "system",
    message: a.message,
    time: formatTimeAgo(a.date || a.timestamp || new Date().toISOString()),
  }));
}

export function RevenueOverviewCard() {
  const { data: analytics } = useAdminAnalytics("month");
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = !shouldReduceMotion;

  const revenue = analytics?.stats?.totalRevenue ?? 0;
  const revenueGrowth = analytics?.stats?.monthlyGrowth?.revenue ?? 0;
  const userGrowth = analytics?.stats?.monthlyGrowth?.users ?? 0;
  const recentActivity = analytics?.recentActivity?.slice(0, 5) ?? [];

  const outerDots = generateArcDots(24, 100, 130, 115);
  const innerDots = generateArcDots(18, 78, 130, 115);

  const dotVariants = {
    hidden: { opacity: 0, scale: 0 },
    visible: { opacity: 0.7, scale: 1, transition: { duration: 0.35, ease: "easeOut" as const } },
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {/* Left — Revenue Arc */}
      <div
        style={{
          borderRadius: 8,
          border: "1px solid var(--admin-border-default, #2a2a2a)",
          background: "var(--admin-bg-card, #1e1e1e)",
          padding: 24,
          overflow: "hidden",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--admin-font-light, #555)", marginBottom: 16 }}>
          Revenue Trend
        </div>

        <div style={{ position: "relative", width: 260, height: 130, margin: "0 auto" }}>
          <svg width="260" height="130" viewBox="0 0 260 130">
            {outerDots.map((dot, i) => (
              <motion.circle
                key={`o-${i}`} cx={dot.x} cy={dot.y} r="5" fill="#065292"
                variants={shouldAnimate ? dotVariants : undefined}
                initial={shouldAnimate ? "hidden" : "visible"}
                animate="visible"
                transition={{ delay: i * 0.025 }}
              />
            ))}
            {innerDots.map((dot, i) => (
              <motion.circle
                key={`i-${i}`} cx={dot.x} cy={dot.y} r="4" fill="#10b981" opacity={0.6}
                variants={shouldAnimate ? dotVariants : undefined}
                initial={shouldAnimate ? "hidden" : "visible"}
                animate="visible"
                transition={{ delay: 0.4 + i * 0.025 }}
              />
            ))}
          </svg>
          <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "var(--admin-font-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Total</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>
              ${revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, borderRadius: 2, background: "#065292" }} />
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Revenue</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: revenueGrowth >= 0 ? "var(--admin-accent-green)" : "var(--admin-accent-red)" }}>
              {revenueGrowth >= 0 ? "+" : ""}{revenueGrowth.toFixed(1)}%
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, borderRadius: 2, background: "#10b981" }} />
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Users</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: userGrowth >= 0 ? "var(--admin-accent-green)" : "var(--admin-accent-red)" }}>
              {userGrowth >= 0 ? "+" : ""}{userGrowth.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Right — Live Feed */}
      <LiveFeed
        items={mapActivityToFeed(recentActivity)}
        title="Recent Activity"
        autoScroll={recentActivity.length > 5}
        maxVisible={5}
      />
    </div>
  );
}
