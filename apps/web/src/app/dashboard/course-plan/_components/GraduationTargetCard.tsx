"use client";

import { GraduationCap, Lock, Pencil, Sparkles, LoaderCircle, Target } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  GraduationTarget,
  AssessmentCompletion,
  GraduationPlanStatus,
} from "@/types/graduationPlan";

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft plan", className: "bg-gray-100 text-gray-700" },
  proposed: { label: "Awaiting counselor", className: "bg-[#FFD23F] text-[#102B47]" },
  approved: { label: "Plan approved", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Needs revision", className: "bg-red-100 text-red-700" },
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
  if (isLoading) {
    return <Skeleton className="h-28 w-full rounded-xl bg-[var(--admin-bg-hover)]" />;
  }

  // ── Locked: assessments incomplete ────────────────────────────────────────
  if (locked) {
    const parts: string[] = [];
    if (completion) {
      if (completion.liaCompleted < 5) parts.push(`LIA ${completion.liaCompleted}/5`);
      if (!completion.pcaCompleted) parts.push("PCA");
      if (completion.evalTotal === 0 || completion.evalCompleted < completion.evalTotal)
        parts.push(`360° ${completion.evalCompleted}/${completion.evalTotal}`);
    }
    return (
      <section className="rounded-xl p-5 bg-[#102B47] text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Lock className="h-5 w-5 mt-0.5 shrink-0 text-[#FFD23F]" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">
                Unlock your personalized graduation plan
              </h2>
              <p className="text-xs mt-1 text-white/80">
                Complete your assessments and we&apos;ll draft a semester-by-semester
                path to your dream school.
                {parts.length > 0 ? ` Still needed: ${parts.join(", ")}.` : ""}
              </p>
              {target?.universityName || target?.major ? (
                <p className="text-xs mt-1 text-white/80">
                  Your goal: {target.universityName ?? "Any university"}
                  {target.major ? ` · ${target.major}` : ""}
                </p>
              ) : null}
            </div>
          </div>
          <Link
            href="/dashboard/assessments"
            className="shrink-0 px-4 py-2 rounded-md text-xs font-bold bg-[#FFD23F] text-[#102B47] hover:opacity-90"
          >
            Go to assessments
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
            <Target className="h-5 w-5 mt-0.5 shrink-0 text-[#2E9098]" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--admin-font-primary)]">
                Where do you want to graduate to?
              </h2>
              <p className="text-xs mt-1 text-[var(--admin-font-secondary)]">
                {target?.suggested && (target.universityName || target.major)
                  ? `Based on your matches: ${[target.universityName, target.major].filter(Boolean).join(" · ")}. Confirm it or pick your own.`
                  : "Pick a university and major and we'll draft a plan to get you there."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onChooseGoal}
            className="shrink-0 px-4 py-2 rounded-md text-xs font-semibold bg-[#102B47] text-white hover:opacity-90"
          >
            Choose your goal
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
          <GraduationCap className="h-5 w-5 mt-0.5 shrink-0 text-[#2E9098]" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--admin-font-primary)]">
                {target.universityName ?? "Any university"}
                {target.major ? ` · ${target.major}` : ""}
              </h2>
              {chip && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${chip.className}`}>
                  {chip.label}
                </span>
              )}
            </div>
            {target.templateLabel && (
              <p className="text-xs mt-1 text-[var(--admin-font-tertiary)]">
                Rigor profile: {target.templateLabel}
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
            Change goal
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
              Generate my plan
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
