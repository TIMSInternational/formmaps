"use client";

import { MessageSquareText } from "lucide-react";

interface PlanRationalePanelProps {
  rationale: string | null;
}

// Rationale is AI-written plain text — render as text only, never as HTML.
export function PlanRationalePanel({ rationale }: PlanRationalePanelProps) {
  if (!rationale) return null;
  return (
    <section className="rounded-xl p-4 bg-[var(--admin-bg-panel)] border border-[var(--admin-border-default)]">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquareText className="h-4 w-4 text-[#2E9098]" />
        <h2 className="text-sm font-semibold text-[var(--admin-font-primary)]">
          Why this plan
        </h2>
      </div>
      <p className="text-xs leading-relaxed whitespace-pre-line text-[var(--admin-font-secondary)]">
        {rationale}
      </p>
    </section>
  );
}
