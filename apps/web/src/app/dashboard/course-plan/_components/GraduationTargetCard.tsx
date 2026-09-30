"use client";

import { GraduationCap, Lock, Pencil, Sparkles, LoaderCircle, Target } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { EVAL_REQUIRED_RULE } from "@/services/assessmentProgressService";
import type {
  GraduationTarget,
  AssessmentCompletion,
  GraduationPlanStatus,
} from "@/types/graduationPlan";

// label = i18n key
const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  draft: { label: "coursePlan.graduationTarget.status.draft", className: "bg-gray-100 text-gray-700" },
  proposed: { label: "coursePlan.graduationTarget.status.proposed", className: "bg-[#FFD23F] text-[#102B47]" },
  approved: { label: "coursePlan.graduationTarget.status.approved", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "coursePlan.graduationTarget.status.rejected", className: "bg-red-100 text-red-700" },
};

interface GraduationTargetCardProps {
  target: GraduationTarget | null | undefined;
  isLoading: boolean;
  /** assessments incomplete — card-level lock, manual planning stays usable */
  locked: boolean;
  completion?: AssessmentCompletion;
  planStatus?: GraduationPlanStatus | null;
  /** show the Generate CTA (target set, no open draft) */
  canGenerate: boolean;
  isGenerating: boolean;
  onChooseGoal: () => void;
  onGenerate: () => void;
}

export function GraduationTargetCard({
  target,
  isLoading,
  locked,
  completion,
  planStatus,
  canGenerate,
  isGenerating,
  onChooseGoal,
  onGenerate,
}: GraduationTargetCardProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return <Skeleton className="h-28 w-full rounded-xl bg-[var(--admin-bg-hover)]" />;
  }

  // ── Locked: assessments incomplete ────────────────────────────────────────
  if (locked) {
    const parts: string[] = [];
    if (completion) {
      if (completion.liaCompleted < 5) parts.push(`LIA ${completion.liaCompleted}/5`);
      if (!completion.pcaCompleted) parts.push("PCA");
      // Personality became a required 4th assessment on 2026-07-30 and was never
      // added here, so a student who owed only Personality saw a lock with nothing
      // listed beside it. `=== false` on purpose: an older payload that omits the
      // field must not be read as "missing".
      if (completion.personalityCompleted === false) parts.push(t("coursePlan.graduationTarget.personality"));
      // Same threshold the server unlocks careers/course-plan with — a
      // student who finished min(evalTotal,3) evaluators is done, even if
      // more were invited (see EVAL_REQUIRED_RULE).
      const evalRequired = EVAL_REQUIRED_RULE(completion.evalTotal);
      if (completion.evalTotal === 0) {
        // min(0,3) is 0, so this used to render "360° 0/0" — the one condition that
        // locks a student out until someone else acts, shown as a satisfied counter.
        parts.push(t("coursePlan.graduationTarget.noEvaluators"));
      } else if (completion.evalCompleted < evalRequired) {
        parts.push(`360° ${completion.evalCompleted}/${evalRequired}`);
      }
    }
    return (
      <section className="rounded-xl p-5 bg-[#102B47] text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Lock className="h-5 w-5 mt-0.5 shrink-0 text-[#FFD23F]" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">
                {t("coursePlan.graduationTarget.unlockTitle")}
              </h2>
              <p className="text-xs mt-1 text-white/80">
                {t("coursePlan.graduationTarget.unlockBody")}
                {parts.length > 0 ? ` ${t("coursePlan.graduationTarget.stillNeeded", { items: parts.join(", ") })}` : ""}
              </p>
              {target?.universityName || target?.major ? (
                <p className="text-xs mt-1 text-white/80">
                  {t("coursePlan.graduationTarget.yourGoal", { goal: [target.universityName ?? t("coursePlan.graduationTarget.anyUniversity"), target.major].filter(Boolean).join(" · ") })}
                </p>
              ) : null}
            </div>
          </div>
          <Link
            href="/dashboard/assessments"
            className="shrink-0 px-4 py-2 rounded-md text-xs font-bold bg-[#FFD23F] text-[#102B47] hover:opacity-90"
          >
            {t("coursePlan.graduationTarget.goToAssessments")}
          </Link>
        </div>
      </section>
    );
  }

  // ── Empty / suggestion: choose a goal ─────────────────────────────────────
  if (!target || target.suggested) {
    return (
      <section className="rounded-xl p-5 bg-[var(--admin-bg-panel)] border border-[var(--admin-border-default)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Target className="h-5 w-5 mt-0.5 shrink-0 text-[var(--admin-accent-blue)]" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--admin-font-primary)]">
                {t("coursePlan.graduationTarget.chooseTitle")}
              </h2>
              <p className="text-xs mt-1 text-[var(--admin-font-secondary)]">
                {target?.suggested && (target.universityName || target.major)
                  ? t("coursePlan.graduationTarget.suggestedBody", { match: [target.universityName, target.major].filter(Boolean).join(" · ") })
                  : t("coursePlan.graduationTarget.chooseBody")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onChooseGoal}
            className="shrink-0 px-4 py-2 rounded-md text-xs font-semibold bg-[#102B47] text-white hover:opacity-90"
          >
            {t("coursePlan.graduationTarget.chooseGoal")}
          </button>
        </div>
      </section>
    );
  }

  // ── Target set ─────────────────────────────────────────────────────────────
  const chip = planStatus ? STATUS_CHIP[planStatus] : null;
  return (
    <section className="rounded-xl p-5 bg-[var(--admin-bg-panel)] border border-[var(--admin-border-default)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <GraduationCap className="h-5 w-5 mt-0.5 shrink-0 text-[var(--admin-accent-blue)]" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--admin-font-primary)]">
                {target.universityName ?? t("coursePlan.graduationTarget.anyUniversity")}
                {target.major ? ` · ${target.major}` : ""}
              </h2>
              {chip && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${chip.className}`}>
                  {t(chip.label)}
                </span>
              )}
            </div>
            {target.templateLabel && (
              <p className="text-xs mt-1 text-[var(--admin-font-tertiary)]">
                {t("coursePlan.graduationTarget.rigorProfile", { label: target.templateLabel })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onChooseGoal}
            className="flex items-center gap-1 px-3 py-2 rounded-md text-xs font-medium border border-[var(--admin-border-default)] text-[var(--admin-font-secondary)] hover:bg-[var(--admin-bg-hover)]"
          >
            <Pencil className="h-3 w-3" />
            {t("coursePlan.graduationTarget.changeGoal")}
          </button>
          {canGenerate && (
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold bg-[#FFD23F] text-[#102B47] hover:opacity-90 disabled:opacity-60"
            >
              {isGenerating ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {t("coursePlan.graduationTarget.generatePlan")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
