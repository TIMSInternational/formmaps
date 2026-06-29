"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { LiveFeed, type FeedItem } from "@/components/ui/live-feed";

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
  const { t } = useTranslation("platform_owner");

  const revenue = analytics?.stats?.totalRevenue ?? 0;
  const revenueThisMonth = analytics?.stats?.monthlyGrowth?.revenue ?? 0;
  const usersThisMonth = analytics?.stats?.monthlyGrowth?.users ?? 0;
  const recentActivity = analytics?.recentActivity?.slice(0, 5) ?? [];

  // Real 12-month revenue series (the old arc of SVG dots was decorative).
  const series: { month: string; revenue: number }[] = analytics?.revenueData ?? [];
  const maxRevenue = Math.max(1, ...series.map((m) => m.revenue));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {/* Left — Revenue Trend (real monthly data) */}
      <div
        style={{
          borderRadius: 8,
          border: "1px solid var(--admin-border-default, #2a2a2a)",
          background: "var(--admin-bg-card, #1e1e1e)",
          padding: 24,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--admin-font-light, #555)" }}>
            {t("revenue.trendTitle")}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.03em" }}>
            ${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110 }}>
          {series.map((m, i) => (
            <div key={`${m.month}-${i}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
              <motion.div
                initial={shouldReduceMotion ? false : { height: 0 }}
                animate={{ height: `${Math.max(3, Math.round((m.revenue / maxRevenue) * 100))}%` }}
                transition={{ duration: 0.4, delay: i * 0.03 }}
                title={`${m.month}: $${m.revenue.toLocaleString()}`}
                style={{
                  width: "100%", borderRadius: 3,
                  background: m.revenue > 0 ? "#065292" : "var(--admin-bg-hover)",
                  minHeight: 3,
                }}
              />
              <span style={{ fontSize: 8, color: "var(--admin-font-light)", overflow: "hidden" }}>{m.month[0]}</span>
            </div>
          ))}
          {series.length === 0 && (
            <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "var(--admin-font-tertiary)", alignSelf: "center" }}>
              {t("revenue.noRevenue")}
            </div>
          )}
        </div>

        {/* This-month facts (real values, correctly labeled) */}
        <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, borderRadius: 2, background: "#065292" }} />
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("revenue.thisMonth")}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-accent-green)" }}>
              ${revenueThisMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 12, borderRadius: 2, background: "#10b981" }} />
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("revenue.newUsers")}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-accent-green)" }}>
              +{usersThisMonth.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Right — Live Feed */}
      <LiveFeed
        items={mapActivityToFeed(recentActivity)}
        title={t("revenue.recentActivity")}
        autoScroll={recentActivity.length > 5}
        maxVisible={5}
      />
    </div>
  );
}
