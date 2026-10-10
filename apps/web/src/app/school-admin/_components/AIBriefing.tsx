"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Sparkles, Loader2, Zap, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";

// ─── AI BRIEFING ───
export function AIBriefing() {
  const { t } = useTranslation("school_admin");
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["sa-ai-insights"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/school-admin/ai-insights");
      return res?.data ?? res;
    },
    enabled: false,
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  if (!data && !isLoading) {
    return (
      <div style={{
        gridColumn: "1 / -1", padding: "24px 28px", borderRadius: 10,
        background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))",
        border: "1px solid rgba(139,92,246,0.15)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles style={{ width: 22, height: 22, color: "#8b5cf6" }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-font-primary)" }}>{t("dashboard.aiBriefing.title")}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{t("dashboard.aiBriefing.subtitle")}</div>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} style={{
          height: 40, borderRadius: 8, padding: "0 24px", fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
          background: "linear-gradient(135deg, #8b5cf6, var(--admin-accent-blue))", color: "#fff",
          border: "none", cursor: "pointer", flexShrink: 0,
        }}>
          <Sparkles style={{ width: 15, height: 15 }} /> {t("dashboard.aiBriefing.generate")}
        </button>
      </div>
    );
  }

  if (isLoading || isFetching) {
    return (
      <div style={{
        gridColumn: "1 / -1", padding: "32px", borderRadius: 10,
        background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)", textAlign: "center",
      }}>
        <Loader2 style={{ width: 24, height: 24, color: "#8b5cf6", margin: "0 auto 10px", animation: "spin 1s linear infinite" }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: "#8b5cf6" }}>{t("dashboard.aiBriefing.analyzing")}</div>
        <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 4 }}>{t("dashboard.aiBriefing.analyzingSubtitle")}</div>
      </div>
    );
  }

  const urgentActions = data?.urgentActions || [];
  const briefing = data?.weeklyBriefing || "";
  const gating = data?.gating as { eligible?: boolean; completed?: number; total?: number; completionRate?: number; threshold?: number } | undefined;

  // Below the completion gate the API returns no narrative; this card used to render nothing at all
  // (audit D8). Say why, and how far the school is.
  if (!briefing && urgentActions.length === 0) {
    const locked = gating && gating.eligible === false;
    return (
      <div style={{
        gridColumn: "1 / -1", padding: "20px 24px", borderRadius: 10,
        background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Sparkles style={{ width: 14, height: 14, color: "#8b5cf6" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--admin-font-primary)" }}>
            {locked ? t("dashboard.aiBriefing.lockedTitle") : t("dashboard.aiBriefing.title")}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.6 }}>
          {locked
            ? t("dashboard.aiBriefing.locked", {
                complete: gating.completed ?? 0, total: gating.total ?? 0,
                percent: gating.completionRate ?? 0, threshold: gating.threshold ?? 90,
              })
            : t("dashboard.aiBriefing.empty")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Briefing Summary */}
      {briefing && (
        <div style={{
          padding: "16px 20px", borderRadius: 10,
          background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))",
          border: "1px solid rgba(139,92,246,0.15)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Sparkles style={{ width: 14, height: 14, color: "#8b5cf6" }} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8b5cf6" }}>{t("dashboard.aiBriefing.label")}</span>
            <Link href="/school-admin/insights" style={{ marginLeft: "auto", fontSize: 11, color: "#8b5cf6", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              {t("dashboard.aiBriefing.fullAnalysis")} <ChevronRight style={{ width: 10, height: 10 }} />
            </Link>
          </div>
          <div style={{ fontSize: 13, color: "var(--admin-font-primary)", lineHeight: 1.6 }}>{briefing}</div>
        </div>
      )}

      {/* Urgent Actions */}
      {urgentActions.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(urgentActions.length, 3)}, 1fr)`, gap: 10 }}>
          {urgentActions.slice(0, 3).map((action: any, i: number) => {
            const color = action.impact === "high" ? "#ef4444" : action.impact === "medium" ? "#f59e0b" : "var(--admin-accent-blue)";
            return (
              <div key={i} style={{
                padding: "14px 16px", borderRadius: 8, borderLeft: `3px solid ${color}`,
                background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Zap style={{ width: 12, height: 12, color }} />
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color, letterSpacing: "0.06em" }}>{t("dashboard.aiBriefing.impactLabel", { impact: action.impact })}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>{action.title}</div>
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{action.description}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
