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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useParentPendingEvaluations } from "@/hooks/useParentPortalQueries";
import { format, differenceInDays, isPast } from "date-fns";

export default function ParentEvaluationsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: evaluations, isLoading } = useParentPendingEvaluations();

  const list = evaluations ?? [];
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
    if (days < 0) return "Overdue";
    if (days === 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    return `${days} days left`;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          {t("parent.evaluations.title", "360° Evaluations")}
        </h1>
        <p className="text-gray-500 mt-1">
          {t(
            "parent.evaluations.subtitle",
            "Complete evaluations requested by the school to support your child's development."
          )}
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-3xl font-bold text-gray-900">
              {isLoading ? "…" : list.length}
            </p>
            <p className="text-sm text-gray-500 mt-1">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-3xl font-bold text-red-600">
              {isLoading ? "…" : overdue.length}
            </p>
            <p className="text-sm text-gray-500 mt-1">Overdue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-3xl font-bold text-emerald-600">
              {isLoading ? "…" : upcoming.length}
            </p>
            <p className="text-sm text-gray-500 mt-1">Upcoming</p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-700">All done!</p>
          <p className="text-sm text-gray-400 mt-1">
            You have no pending evaluations right now.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {overdue.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Overdue ({overdue.length})
              </h3>
              <div className="space-y-3">
                {overdue.map((ev, idx) => (
                  <EvaluationCard
                    key={ev.evaluationId}
                    ev={ev}
                    idx={idx}
                    urgencyColor={urgencyColor}
                    urgencyLabel={urgencyLabel}
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
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Upcoming ({upcoming.length})
              </h3>
              <div className="space-y-3">
                {upcoming.map((ev, idx) => (
                  <EvaluationCard
                    key={ev.evaluationId}
                    ev={ev}
                    idx={idx}
                    urgencyColor={urgencyColor}
                    urgencyLabel={urgencyLabel}
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
  onComplete,
}: {
  ev: { evaluationId: string; studentName: string; deadline: string; token: string };
  idx: number;
  urgencyColor: (d: string) => string;
  urgencyLabel: (d: string) => string;
  onComplete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.06 }}
    >
      <Card className="hover:shadow-md transition-shadow border border-gray-100">
        <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-indigo-100 rounded-lg shrink-0">
              <FileCheck className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                360° Evaluation for{" "}
                <span className="text-indigo-600">{ev.studentName}</span>
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-sm text-gray-500">
                  Due: {format(new Date(ev.deadline), "MMMM d, yyyy")}
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

          <Button
            onClick={onComplete}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 shrink-0"
            size="sm"
          >
            <ExternalLink className="h-4 w-4" />
            Complete Now
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
