"use client";

import { useState } from "react";
import { GraduationCap, CheckCircle2, LoaderCircle } from "lucide-react";
import {
  useGraduationTarget,
  useSetGraduationTarget,
} from "@/hooks/useGraduationPlanQueries";

interface UniversityGoalButtonProps {
  universityId: string;
  universityName: string;
  /** prefill candidates for the major input (e.g. recommended program names) */
  suggestedMajors?: string[];
}

// "Set as my graduation goal" entry point on the university detail panel.
// Saving routes through the same target the course-plan page uses.
export function UniversityGoalButton({
  universityId,
  universityName,
  suggestedMajors = [],
}: UniversityGoalButtonProps) {
  const targetQuery = useGraduationTarget();
  const setTarget = useSetGraduationTarget();
  const target = targetQuery.data;
  const isCurrentGoal = !!target && !target.suggested && target.universityId === universityId;

  const [formOpen, setFormOpen] = useState(false);
  const [major, setMajor] = useState("");

  if (targetQuery.isLoading) return null;

  if (isCurrentGoal) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-600">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          {universityName} is your graduation goal
          {target?.major ? ` · ${target.major}` : ""}
        </span>
      </div>
    );
  }

  if (!formOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setMajor(target?.major || suggestedMajors[0] || "");
          setFormOpen(true);
        }}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold bg-[#FFD23F] text-[#102B47] hover:opacity-90 transition-opacity"
      >
        <GraduationCap className="h-4 w-4" />
        Set as my graduation goal
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#FFD23F] p-3">
      <p className="text-xs font-semibold text-[var(--admin-font-primary)]">
        Graduate to {universityName} — studying what?
      </p>
      <input
        value={major}
        onChange={(e) => setMajor(e.target.value)}
        placeholder="Intended major (e.g. Computer Science)"
        maxLength={200}
        className="w-full h-9 rounded-md px-3 text-sm outline-none bg-[var(--admin-bg-hover)] border border-[var(--admin-border-default)] text-[var(--admin-font-primary)]"
      />
      {suggestedMajors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestedMajors.slice(0, 4).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMajor(m)}
              className="text-[10px] px-2 py-1 rounded-full border border-[var(--admin-border-default)] text-[var(--admin-font-secondary)] hover:bg-[var(--admin-bg-hover)]"
            >
              {m}
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setFormOpen(false)}
          className="px-3 py-1.5 rounded-md text-xs font-medium text-[var(--admin-font-secondary)] hover:bg-[var(--admin-bg-hover)]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!major.trim() || setTarget.isPending}
          onClick={() =>
            setTarget.mutate(
              { universityId, major: major.trim() },
              { onSuccess: () => setFormOpen(false) },
            )
          }
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold bg-[#102B47] text-white hover:opacity-90 disabled:opacity-60"
        >
          {setTarget.isPending && <LoaderCircle className="h-3 w-3 animate-spin" />}
          Save goal
        </button>
      </div>
    </div>
  );
}
