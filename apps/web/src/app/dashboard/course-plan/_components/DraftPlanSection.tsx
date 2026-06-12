"use client";

import { Sparkles, Send, RefreshCw, Trash2, LoaderCircle, AlertTriangle } from "lucide-react";
import { SequenceBuilder } from "@/components/course-plan/SequenceBuilder";
import { planItemsToEnrollments } from "@/components/course-plan/planItems";
import type { StudentCoursePlanResponse } from "@/types/coursePlan";
import type { GraduationPlan } from "@/types/graduationPlan";

interface DraftPlanSectionProps {
  plan: GraduationPlan;
  /** the student's real plan rows (enriched), rendered unchanged for the diff view */
  planData: StudentCoursePlanResponse;
  onSubmit: () => void;
  onRegenerate: () => void;
  onDiscard: () => void;
  isSubmitting: boolean;
  isRegenerating: boolean;
  isDiscarding: boolean;
}

export function DraftPlanSection({
  plan,
  planData,
  onSubmit,
  onRegenerate,
  onDiscard,
  isSubmitting,
  isRegenerating,
  isDiscarding,
}: DraftPlanSectionProps) {
  const busy = isSubmitting || isRegenerating || isDiscarding;

  return (
    <section className="rounded-xl p-4 space-y-4 bg-[var(--admin-bg-panel)] border border-[var(--admin-border-default)]">
      {/* ── Status strip ────────────────────────────────────────────────── */}
      {plan.status === "draft" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#FFD600] bg-yellow-50 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-gray-900">
            <Sparkles className="h-4 w-4 text-[#065292]" />
            <span>
              <span className="font-semibold">Draft plan ready</span> —{" "}
              {plan.items.length} proposed courses ({plan.totalPlannedCredits} credits).
              Review below, then send it to your counselor.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              disabled={busy}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              {isDiscarding ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Discard
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={busy}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--admin-border-default)] text-[var(--admin-font-secondary)] hover:bg-[var(--admin-bg-hover)] disabled:opacity-60"
            >
              {isRegenerating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold bg-[#065292] text-white hover:opacity-90 disabled:opacity-60"
            >
              {isSubmitting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Submit to counselor
            </button>
          </div>
        </div>
      )}

      {plan.status === "proposed" && (
        <div className="flex items-center gap-2 rounded-lg border border-[#065292]/30 bg-blue-50 px-4 py-3 text-xs text-gray-900">
          <Send className="h-4 w-4 text-[#065292]" />
          <span>
            <span className="font-semibold">Submitted</span> — your counselor is
            reviewing this plan. You&apos;ll be notified when it&apos;s approved.
          </span>
        </div>
      )}

      {plan.status === "rejected" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-2 text-xs text-gray-900 min-w-0">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
            <span>
              <span className="font-semibold">Your counselor asked for changes</span>
              {plan.reviewNote ? `: "${plan.reviewNote}"` : "."}
            </span>
          </div>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold bg-[#065292] text-white hover:opacity-90 disabled:opacity-60"
          >
            {isRegenerating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Revise &amp; regenerate
          </button>
        </div>
      )}

      {/* ── Diff view: existing rows unchanged, draft additions in yellow ── */}
      <SequenceBuilder
        planData={planData}
        isLoading={false}
        mode="student"
        readOnly
        extraEnrollments={planItemsToEnrollments(plan)}
      />
      <p className="text-[11px] text-[var(--admin-font-tertiary)]">
        Yellow “Proposed” courses are additions suggested for your goal — your
        existing classes are never changed by this plan.
      </p>
    </section>
  );
}
