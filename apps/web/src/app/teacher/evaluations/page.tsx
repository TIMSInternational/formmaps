"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  FileCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeacherPendingEvaluations } from "@/hooks/useTeacherPortalQueries";
import { format, differenceInDays, isPast } from "date-fns";

export default function TeacherEvaluationsPage() {
  const { t } = useTranslation("teacher");
  const router = useRouter();
  const { data: evaluations, isLoading } = useTeacherPendingEvaluations();

  const list = Array.isArray(evaluations) ? evaluations : [];
  const overdue = list.filter((e) => isPast(new Date(e.deadline)));
  const upcoming = list.filter((e) => !isPast(new Date(e.deadline)));

  function urgencyColor(deadline: string) {
    const days = differenceInDays(new Date(deadline), new Date());
    if (days < 0) return "bg-red-100 text-red-700";
    if (days <= 3) return "bg-amber-100 text-amber-700";
    return "bg-emerald-100 text-emerald-700";
  }

  function urgencyLabel(deadline: string) {
    const days = differenceInDays(new Date(deadline), new Date());
    if (days < 0) return t("evaluations.card.urgency.overdue");
    if (days === 0) return t("evaluations.card.urgency.dueToday");
    if (days === 1) return t("evaluations.card.urgency.dueTomorrow");
    return t("evaluations.card.urgency.daysLeft", { count: days });
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{t("evaluations.badge")}</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          {t("evaluations.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("evaluations.subtitle")}
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="dash-card p-5 text-center">
          <p className="text-3xl font-bold text-foreground tracking-tight">
            {isLoading ? "…" : list.length}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{t("evaluations.stats.pending")}</p>
        </div>
        <div className="dash-card p-5 text-center">
          <p className="text-3xl font-bold text-red-500 tracking-tight">
            {isLoading ? "…" : overdue.length}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{t("evaluations.stats.overdue")}</p>
        </div>
        <div className="dash-card p-5 text-center">
          <p className="text-3xl font-bold text-emerald-500 tracking-tight">
            {isLoading ? "…" : upcoming.length}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{t("evaluations.stats.upcoming")}</p>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-20 dash-card border-dashed">
          <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
          <p className="text-lg font-semibold text-foreground">{t("evaluations.allDone")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("evaluations.noEvals")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {overdue.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {t("evaluations.overdueSection")} ({overdue.length})
              </h3>
              <div className="space-y-3">
                {overdue.map((ev, idx) => (
                  <EvaluationCard
                    key={ev.evaluationId}
                    ev={ev}
                    idx={idx}
                    urgencyColor={urgencyColor}
                    urgencyLabel={urgencyLabel}
                    t={t}
                    onComplete={() =>
                      router.push(`/evaluation/evaluator?token=${ev.token}`)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t("evaluations.upcomingSection")} ({upcoming.length})
              </h3>
              <div className="space-y-3">
                {upcoming.map((ev, idx) => (
                  <EvaluationCard
                    key={ev.evaluationId}
                    ev={ev}
                    idx={idx}
                    urgencyColor={urgencyColor}
                    urgencyLabel={urgencyLabel}
                    t={t}
                    onComplete={() =>
                      router.push(`/evaluation/evaluator?token=${ev.token}`)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvaluationCard({
  ev,
  idx,
  urgencyColor,
  urgencyLabel,
  t,
  onComplete,
}: {
  ev: { evaluationId: string; studentName: string; deadline: string; token: string };
  idx: number;
  urgencyColor: (d: string) => string;
  urgencyLabel: (d: string) => string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onComplete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.06 }}
    >
      <div className="dash-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(46,144,152,0.10)" }}>
            <FileCheck className="h-4 w-4" style={{ color: "#2E9098" }} strokeWidth={1.8} />
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {t("evaluations.card.evaluationFor")}{" "}
              <span style={{ color: "#2E9098" }}>{ev.studentName}</span>
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t("evaluations.card.due")} {format(new Date(ev.deadline), "MMMM d, yyyy")}
              </span>
              <Badge
                variant="secondary"
                className={`text-xs px-2 py-0.5 ${urgencyColor(ev.deadline)}`}
              >
                {urgencyLabel(ev.deadline)}
              </Badge>
            </div>
          </div>
        </div>

        <Button onClick={onComplete} className="gap-2 shrink-0" size="sm">
          <ExternalLink className="h-4 w-4" />
          {t("evaluations.card.completeNow")}
        </Button>
      </div>
    </motion.div>
  );
}
