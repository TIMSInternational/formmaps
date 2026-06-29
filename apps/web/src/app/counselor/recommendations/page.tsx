"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Clock, CheckCircle2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getRecommendationDashboard,
  listReceivedRecommendations,
  RecommendationRequest,
} from "@/services/recommendationService";
import { RequestsTable } from "./_components/RequestsTable";

export default function CounselorRecommendationsPage() {
  const { t } = useTranslation("counselor");
  const [dashboard, setDashboard] = useState<{
    total: number;
    countByStatus: Record<string, number>;
    requests: RecommendationRequest[];
  } | null>(null);
  const [myRequests, setMyRequests] = useState<RecommendationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [dash, received] = await Promise.all([
        getRecommendationDashboard(),
        listReceivedRecommendations(),
      ]);
      setDashboard(dash);
      setMyRequests(Array.isArray(received) ? received : []);
    } catch {
      toast.error(t("recommendations.failedToLoad", "Failed to load recommendation data"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const myRequestIds = new Set(myRequests.map((r) => r.id));
  const allRequests = dashboard?.requests ?? [];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" style={{ background: "var(--admin-bg-hover)" }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-24" style={{ background: "var(--admin-bg-hover)" }} />
          ))}
        </div>
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  const countByStatus = dashboard?.countByStatus ?? {};

  const summaryStats = [
    { labelKey: "recommendations.statRequested", fallback: "Requested", value: countByStatus.requested ?? 0, color: "#065292", icon: Clock },
    { labelKey: "recommendations.statAccepted", fallback: "Accepted", value: countByStatus.accepted ?? 0, color: "#f59e0b", icon: CheckCircle2 },
    { labelKey: "recommendations.statInProgress", fallback: "In Progress", value: countByStatus.in_progress ?? 0, color: "#f97316", icon: Loader2 },
    { labelKey: "recommendations.statSubmitted", fallback: "Submitted", value: countByStatus.submitted ?? 0, color: "#10b981", icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-1"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
          {t("dashboard.badge", "Counselor")}
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-none">
          {t("recommendations.title", "Recommendation Dashboard")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("recommendations.subtitle", "Track and respond to letters of recommendation across your school.")}
        </p>
      </motion.div>

      {/* Summary cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {summaryStats.map((stat, i) => (
          <motion.div
            key={stat.labelKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.05 }}
            style={{
              borderRadius: 8,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)",
              padding: 16,
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `${stat.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 10,
            }}>
              <stat.icon style={{ width: 15, height: 15, color: stat.color }} />
            </div>
            <div style={{
              fontSize: 24, fontWeight: 700,
              color: "var(--admin-font-primary)", letterSpacing: "-0.02em",
            }}>
              {stat.value}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)",
              textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2,
            }}>
              {t(stat.labelKey, stat.fallback)}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Requests table */}
      <RequestsTable
        allRequests={allRequests}
        myRequestIds={myRequestIds}
        onAction={load}
      />
    </div>
  );
}
