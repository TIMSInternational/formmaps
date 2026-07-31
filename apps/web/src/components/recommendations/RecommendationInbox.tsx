"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Inbox } from "lucide-react";
import { listReceivedRecommendations, RecommendationRequest } from "@/services/recommendationService";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import { StatusBadge } from "./StatusBadge";
import { RecommendationActionMenu } from "./RecommendationActionMenu";

const STATUS_ORDER: Record<string, number> = { requested: 0, accepted: 1, in_progress: 2, submitted: 3, declined: 4 };

export function RecommendationInbox({ roleLabel }: { roleLabel?: string }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["recommendations", "received"],
    queryFn: listReceivedRecommendations,
  });

  const requests = [...(data ?? [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );
  const onAction = () => qc.invalidateQueries({ queryKey: ["recommendations", "received"] });

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-1">
        {roleLabel && (
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{roleLabel}</span>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-none">Recommendation Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">Accept, decline, and upload letters of recommendation requested of you.</p>
      </motion.div>

      <QueryStateBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={requests.length === 0}
        onRetry={() => refetch()}
        emptyFallback={
          <div className="dash-card p-12 text-center" style={{ background: "var(--admin-bg-card)" }}>
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl border flex items-center justify-center" style={{ borderColor: "var(--admin-border-default)" }}>
              <Inbox className="h-7 w-7" style={{ color: "#2E9098" }} />
            </div>
            <h3 className="text-sm font-bold text-foreground mb-1">No recommendation requests</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">When a student asks you for a letter, it will appear here.</p>
          </div>
        }
      >
        <div className="space-y-2">
          {requests.map((req: RecommendationRequest) => (
            <div
              key={req.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-4"
              style={{ borderColor: "var(--admin-border-default)", background: "var(--admin-bg-card)" }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{req.student?.name ?? "Student"}</span>
                  <StatusBadge status={req.status} />
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {req.relationship ? `${req.relationship} · ` : ""}{req.requestMessage ?? ""}
                </p>
                {req.status === "declined" && req.declineReason && (
                  <p className="text-xs mt-1" style={{ color: "#ef4444" }}>Declined: {req.declineReason}</p>
                )}
              </div>
              <RecommendationActionMenu req={req} isMyRequest onAction={onAction} />
            </div>
          ))}
        </div>
      </QueryStateBoundary>
    </div>
  );
}

export default RecommendationInbox;
