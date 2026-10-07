"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, Circle, Lock } from "lucide-react";
import {
  REQUIRED_FOR_MATCHES,
  countCompletedRequired,
  formatAssessmentList,
  getAssessmentStatuses,
} from "@/lib/assessments";
import type { AssessmentOverallProgress } from "@/services/assessmentProgressService";

/**
 * The locked screen shown by Career Explorer and University Finder until the
 * student completes every assessment required for matches (#398). Both
 * surfaces read the instrument list, names and N/M from `@/lib/assessments`.
 */
export function AssessmentGate({
  progress,
  unlocks,
}: {
  progress?: AssessmentOverallProgress | null;
  unlocks: "careers" | "universities";
}) {
  const { t, i18n } = useTranslation();
  const statuses = getAssessmentStatuses(progress);
  const { completed, total } = countCompletedRequired(statuses);
  const list = formatAssessmentList(t, i18n.language);
  const items = REQUIRED_FOR_MATCHES.map((a) => ({ ...a, status: statuses[a.id] }));
  const next = items.find((a) => a.status !== "completed");

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-8">
      <div className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200/30">
          <Lock className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t("instruments.gate.title")}</h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto leading-relaxed">
          {t(unlocks === "careers" ? "instruments.gate.careersSubtitle" : "instruments.gate.universitiesSubtitle", {
            count: total,
            list,
          })}
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
        <span>{t("instruments.gate.progress", { completed, total })}</span>
        <div className="flex gap-1.5">
          {items.map((a, i) => (
            <div
              key={a.id}
              className={`w-8 h-2 rounded-full transition-colors ${i < completed ? "bg-emerald-500" : "bg-muted"}`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {items.map((a) => {
          const isComplete = a.status === "completed";
          const isInProgress = a.status === "in_progress";
          return (
            <Link
              key={a.id}
              href={a.href}
              className={`flex items-center gap-4 p-5 rounded-2xl border transition-all duration-200 ${
                isComplete
                  ? "bg-emerald-50/50 border-emerald-200/60"
                  : "bg-card border-border hover:border-primary/30 hover:shadow-sm"
              }`}
            >
              <div className="shrink-0">
                {isComplete ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                ) : (
                  <Circle className={`w-6 h-6 ${isInProgress ? "text-amber-400" : "text-muted-foreground/30"}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold ${isComplete ? "text-emerald-700" : "text-foreground"}`}>
                  {t(`${a.i18nKey}.fullName`)}
                  {isInProgress && (
                    <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                      {t("instruments.gate.inProgress")}
                    </span>
                  )}
                </h3>
                <p className={`text-xs mt-0.5 ${isComplete ? "text-emerald-600/70" : "text-muted-foreground"}`}>
                  {t(`${a.i18nKey}.description`)}
                </p>
              </div>
              {!isComplete && <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
            </Link>
          );
        })}
      </div>

      {next && (
        <div className="text-center pt-2">
          <Link
            href={next.href}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            {next.status === "in_progress" ? t("instruments.gate.continue") : t("instruments.gate.startNext")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

export default AssessmentGate;
